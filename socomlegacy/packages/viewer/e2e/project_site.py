"""Check a running Legacy dev/preview server, without a disc or match server.

python packages/viewer/e2e/project_site.py --url http://localhost:5194
"""
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://localhost:5194')
parser.add_argument('--screenshots', default='test-results/project-site')
args = parser.parse_args()
base = args.url.rstrip('/')
shots = Path(args.screenshots)
shots.mkdir(parents=True, exist_ok=True)
titles = {'news': 'News & patch notes', 'roadmap': 'The road to release', 'journey': 'The journey', 'archive': 'The SOCOM II archive', 'server': 'The game server'}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        for width in [1280, 390, 320]:
            context = browser.new_context(viewport={'width': width, 'height': 900}, has_touch=width < 600)
            page = context.new_page()
            errors, requests = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda request: requests.append(request.url))
            # (No 404 check for the retired landing pages: under OT.R19 every path without a file is the menu flow's page,
            # in Vite's dev and preview servers as in shared/deploy/site/nginx.conf's last location.)
            for route, heading in titles.items():
                requests.clear()
                response = page.goto(f'{base}/{route}')
                assert response and response.ok, (route, response.status if response else None)
                page.wait_for_load_state('networkidle')
                expect(page.get_by_role('heading', name=heading, exact=True)).to_be_visible()
                expect(page.locator('[aria-current="page"]')).to_have_text(route.capitalize())
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (route, width, 'overflow')
                assert not any('/src/main.ts' in url or '/maps/' in url or ('/rooms' in url and route != 'server') or 'launcher-' in url for url in requests), requests
                assert not any('unzipped' in url for url in requests), requests
                page.screenshot(path=str(shots / f'{route}-{width}.png'), full_page=True)
                page.goto(f'{base}/{route}/')
                page.wait_for_load_state('networkidle')
                expect(page.get_by_role('heading', name=heading, exact=True)).to_be_visible()
                page.reload()
                page.wait_for_load_state('networkidle')
                expect(page.get_by_role('heading', name=heading, exact=True)).to_be_visible()

            # The routes loop ends on the server page; the archive's own checks start from the archive.
            page.goto(f'{base}/archive')
            page.wait_for_load_state('networkidle')
            expect(page.locator('.project-archive-card')).to_have_count(5)
            page.get_by_role('searchbox', name='Search the archive').fill('  SONY headset ')
            expect(page.locator('.project-archive-card')).to_have_count(1)
            page.reload()
            page.wait_for_load_state('networkidle')
            expect(page.locator('.project-archive-card')).to_have_count(1)
            page.get_by_text('Source & provenance', exact=True).click()
            expect(page.get_by_text('Linked material is hosted externally.', exact=False)).to_be_visible()
            page.get_by_role('button', name='Clear filters').click()
            page.get_by_role('button', name='Original website', exact=True).click()
            expect(page.locator('.project-archive-card')).to_have_count(1)
            expect(page.locator('.project-archive-card a')).to_have_count(0)
            page.get_by_role('checkbox', name='Available sources only').check()
            expect(page.get_by_role('heading', name='No matching items')).to_be_visible()
            page.get_by_role('button', name='Clear filters').click()
            expect(page.locator('.project-archive-card')).to_have_count(5)
            page.get_by_role('checkbox', name='Available sources only').check()
            expect(page.locator('.project-archive-card')).to_have_count(2)
            for source in page.locator('.project-source').all():
                assert source.get_attribute('target') == '_blank'
                assert 'noopener' in source.get_attribute('rel')
            for control in page.locator('.project-filter, .project-nav a, .project-reset, .project-search-label input').all():
                if control.is_visible():
                    assert control.bounding_box()['height'] >= 44, control.text_content()

            page.goto(f'{base}/setup')  # the old page (urls.ts SETUP) since CX-9a: the base path is the console launcher's
            page.wait_for_load_state('networkidle')
            expect(page.locator('#disc-page')).to_be_visible()
            # CX-9b (CX.R8): the old launcher's top bar, and with it the project nav (LS-1), went with the old layout: the game
            # page carries no project links, and the viewer's own bar never did.
            expect(page.locator('.s2u-navlinks a')).to_have_count(0)
            page.screenshot(path=str(shots / f'setup-page-{width}.png'))
            expect(page.locator('#site-links a[href$="news"], #site-links a[href$="roadmap"], #site-links a[href$="journey"], #site-links a[href$="archive"], #site-links a[href$="server"]')).to_have_count(0)
            assert not errors, errors
            context.close()
            print(f'PASS: pages, routes, filters, reloads and layout at {width}px')
    finally:
        browser.close()
