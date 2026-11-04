#!/usr/bin/env python3
# The gate's copy of this probe (LATER 424): socomlegacy/packages/viewer/e2e/forgeAgentNative.spec.ts; this one stays for hand runs.
"""Local native-browser MCP/WebRTC acceptance probe; credentials stay in memory, evidence stays outside git.
Start the gateway and Vite as described in the Forge agent compatibility record, then run --help.
"""
import json, re, hashlib, base64, time
from urllib.parse import urlencode, urlparse, parse_qs
from pathlib import Path
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Thread
class Callback(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.end_headers(); self.wfile.write(b"Guest authorization complete.")
    def log_message(self,*args): pass
parser=argparse.ArgumentParser(description='Probe the running local Forge gateway and native browser without disc data. Requires Python Playwright and Chromium.')
parser.add_argument('--page',default='http://localhost:5361')
parser.add_argument('--gateway',default='http://127.0.0.1:5360')
parser.add_argument('--callback-port',type=int,default=5362)
parser.add_argument('--out',type=Path,required=True,help='Evidence directory outside the repository')
parser.add_argument('--plant',action='store_true',help='Build a Demolition test layout, then verify normal pickup and planting in private Forge Play; needs local game data')
options=parser.parse_args()
repo=Path(__file__).resolve().parents[3]
root=options.out.resolve()
if root.is_relative_to(repo): parser.error('Keep evidence outside the repository.')
root.mkdir(parents=True,exist_ok=True)
callback=HTTPServer(("127.0.0.1",options.callback_port),Callback)
Thread(target=callback.serve_forever,daemon=True).start()
from playwright.sync_api import sync_playwright
gateway=options.gateway.rstrip('/')
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--enable-unsafe-swiftshader','--use-angle=swiftshader'])
    context=browser.new_context(viewport={'width':1440,'height':1000},permissions=['clipboard-read','clipboard-write'])
    metadata=context.request.get(gateway+'/.well-known/oauth-authorization-server').json()
    redirect=f'http://127.0.0.1:{options.callback_port}/callback'
    registered=context.request.post(metadata['registration_endpoint'],data={'redirect_uris':[redirect],'token_endpoint_auth_method':'none','client_name':'Native browser acceptance probe','grant_types':['authorization_code'],'response_types':['code']}).json()
    verifier='v'*43
    challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    auth=context.new_page()

    auth.goto(metadata['authorization_endpoint']+'?'+urlencode({'client_id':registered['client_id'],'redirect_uri':redirect,'response_type':'code','code_challenge_method':'S256','code_challenge':challenge,'resource':gateway+'/mcp','state':'probe'}))
    auth.get_by_role('button',name='Continue as guest').click()
    auth.wait_for_url(redirect+'**',timeout=5000)
    code=parse_qs(urlparse(auth.url).query)['code'][0]
    tokens=context.request.post(metadata['token_endpoint'],form={'grant_type':'authorization_code','client_id':registered['client_id'],'code':code,'code_verifier':verifier,'redirect_uri':redirect,'resource':gateway+'/mcp'}).json()
    headers={'Authorization':'Bearer '+tokens['access_token']}
    auth.close()
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(options.page.rstrip('/')+('/forge?floor&devmode' if options.plant else '/forge?floor'))
    page.wait_for_load_state('networkidle')
    page.get_by_text('Connect your agent',exact=True).click()
    page.get_by_role('button',name='Copy connection instructions').wait_for(timeout=60000)
    page.screenshot(path=str(root/'forge-connect.png'),full_page=True)
    page.get_by_role('button',name='Copy connection instructions').click()
    page.get_by_text('Waiting for your agent',exact=True).wait_for(timeout=10000)
    blurb=page.evaluate('navigator.clipboard.readText()')
    invitation=json.loads(re.search(r'Use agent_pair with invitation ("[^"]+")',blurb).group(1))
    pair=context.request.post(gateway+'/api/v1/pair',headers=headers,data={'invitation':invitation,'permissions':['inspect','edit','capture','import','test'],'clientName':'Native browser acceptance probe'}).json()
    page.get_by_text('Allow this connection?',exact=True).wait_for(timeout=10000)
    for box in page.locator('.agent-panel__permissions input').all(): box.check()
    page.screenshot(path=str(root/'forge-approve.png'),full_page=True)
    page.get_by_role('button',name='Allow selected access').click()
    page.get_by_text('Agent connected',exact=True).wait_for(timeout=30000)
    statuses=context.request.get(gateway+'/api/v1/status',headers=headers).json()
    session=statuses['sessions'][0]
    def command(op,args,revision=None,rid=None):
        time.sleep(0.31) # Stay within the actual per-session command budget.
        body={'version':1,'requestId':rid or 'probe-'+str(time.monotonic_ns()),'sessionId':session['sessionId'],'targetId':session['targetId'],'epoch':session['epoch'],'operation':op,'args':args}
        if revision is not None: body['expectedRevision']=revision
        return context.request.post(gateway+'/api/v1/commands',headers=headers,data=body,timeout=35000).json()
    before=command('target.status',{})
    edit=command('forge.edit',{'operation':'layout.name','arguments':{'name':'Agent acceptance floor'}},before['revision'],'one-edit')
    assert edit['outcome']=='ok',edit
    retry=command('forge.edit',{'operation':'layout.name','arguments':{'name':'Agent acceptance floor'}},before['revision'],'one-edit')
    assert retry==edit,(retry,edit)
    recipe=command('forge.read',{'section':'metadata'})
    assert recipe['data']['name']=='Agent acceptance floor',recipe
    plant_result=None
    if options.plant:
        def read():
            answer=command('target.status',{})
            assert answer.get('outcome')=='ok',answer
            return answer['data']
        def mutate(op,args):
            answer=command(op,args,read()['revision'])
            if answer.get('code')=='REVISION_CONFLICT': answer=command(op,args,read()['revision'])
            assert answer.get('outcome')=='ok',answer
            return answer
        def edit(op,args): return mutate('forge.edit',{'operation':op,'arguments':args})
        def wait(predicate,seconds=120):
            deadline=time.monotonic()+seconds
            while True:
                state=read()
                if predicate(state): return state
                assert time.monotonic()<deadline,state
                page.wait_for_timeout(150)
        def scenario(steps):
            mutate('scenario.start',{'steps':steps})
            deadline=time.monotonic()+35
            while True:
                answer=command('scenario.status',{})
                if answer.get('data',{}).get('state')!='running': break
                assert time.monotonic()<deadline,answer
                page.wait_for_timeout(150)
            assert answer.get('data',{}).get('state')=='completed',answer
            return answer['data']
        # Authored test geometry, a Forge adaptation: no Play position or outcome setters.
        edit('type.set',{'type':2})
        edit('spawn.place',{'team':'A','at':[0,0,0],'yaw':0})
        edit('spawn.place',{'team':'B','at':[300,0,0],'yaw':0})
        edit('bomb.place',{'kind':'start','at':[0,0,-80]})
        edit('bomb.place',{'kind':'seal','at':[0,0,-180]})
        edit('bomb.place',{'kind':'terrorist','at':[200,0,0]})
        # Existing Forge Play-from-here chooses the floor under the Build camera for its opening spawn.
        edit('camera.pose',{'x':0,'y':100,'z':0,'yaw':0,'pitch':-60})
        mutate('forge.play',{})
        state=wait(lambda s:s.get('play',{}).get('ready') is True)
        if state['play']['armory']:
            for _ in range(12):
                mutate('forge.input',{'operation':'armory.key','arguments':{'code':'Enter'}})
                state=read()
                if not state['play']['armory']: break
            assert not state['play']['armory'],state
        wait(lambda s:s.get('play',{}).get('action',{}).get('playing') is True)
        scenario([{'operation':'input.set','args':{'moveY':1},'seconds':2.8},{'operation':'input.release'}])
        picked=read()['play']
        assert picked['plant']['state']==2 and picked['action']['prompt']=='bomb',picked
        job=scenario([{'operation':'action.hold','seconds':6},{'operation':'action.release'},
            {'operation':'observe','args':{'field':'plant.state','equals':3},'seconds':4}])
        actual=read()['play']
        assert actual['plant']['state']==3,actual
        plant_result={'pickup':picked['plant'],'plant':actual['plant'],'job':job}
    image=command('target.capture',{})
    assert image['outcome']=='ok' and image['data']['image']['mimeType']=='image/png',str(image)[:300]
    image_bytes=base64.b64decode(image['data']['image']['data'])
    (root/'agent-canvas.png').write_bytes(image_bytes)
    page.screenshot(path=str(root/'forge-connected.png'),full_page=True)
    if options.plant: mutate('play.stop',{})
    page.get_by_role('button',name='Disconnect agent').click()
    blocked=command('forge.read',{})
    assert blocked['code']=='NOT_PAIRED',blocked
    result={'guestConsent':'passed','nativeWebRTC':'passed','actualForgeEdit':'passed','retryReceipt':'passed','gameCanvasCaptureBytes':len(image_bytes),'disconnect':'passed','pageErrors':errors}
    if plant_result is not None: result['normalInputPlant']=plant_result
    assert not errors,errors
    (root/'native-browser.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result))
    browser.close()
callback.shutdown()
