/** Validation instruments, not original gameplay rules. */
export type ValidationState = 'ready'|'gaps'|'passed'|'failed'|'blocked'|'not-run';
export interface ValidationCheck {status:ValidationState;details:string[];evidence?:unknown}
export interface ValidationRow {
 map:string;name?:string;assets:ValidationCheck;server:ValidationCheck;
 features?:Record<string,ValidationCheck>;browser?:ValidationCheck;physical?:ValidationCheck;
}
export function selectValidationMaps(paths:readonly string[], requested?:string):string[]{
 const maps=[...new Set(paths.flatMap(p=>/^RUN\/MP\d+\.ZDB$/i.test(p)?[p.slice(4,-4).toUpperCase()]:[]))]
  .sort((a,b)=>Number(a.slice(2))-Number(b.slice(2)));
 if(!maps.length)throw Error('No multiplayer maps discovered');
 if(requested===undefined)return maps;
 const asked=requested.split(',').map(s=>s.trim().toUpperCase());
 for(const name of asked)if(!maps.includes(name))throw Error(`Unknown requested map: ${name||'(empty)'}`);
 return maps.filter(m=>asked.includes(m));
}
export function renderValidationMatrix(rows:readonly ValidationRow[]):string{
 const lines=['# All-map validation record','','Asset readiness is decoding only. Server simulation is not rendered multiplayer or physical listening.',
  'Unexecuted layers remain not-run. This is not a complete parity certificate.','',
  '| Map | ISO assets | Server lifecycle | Rendered features | Physical PC/Mac |','|---|---|---|---|---|'];
 for(const r of rows)lines.push(`| ${r.map} | ${r.assets.status} | ${r.server.status} | ${r.browser?.status??'not-run'} | ${r.physical?.status??'not-run'} |`);
 for(const r of rows){
  lines.push('',`## ${r.map}${r.name?' — '+r.name:''}`,'');
  for(const [feature,check] of Object.entries(r.features??{}))lines.push(`- ${feature}: ${check.status}${check.details.length?' — '+check.details.join('; '):''}`);
  for(const detail of [...r.assets.details,...r.server.details])lines.push(`- ${detail.replaceAll('|','/').replaceAll('\n',' ')}`);
 }
 return lines.join('\n')+'\n';
}
