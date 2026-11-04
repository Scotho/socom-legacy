import {existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {selectValidationMaps} from '../../../tools/mapValidation';
/** Test selection only. No production map allowlist or gameplay restriction changes. */
export function validationMaps(defaults:readonly string[],requested=process.env.S2U_TEST_MAPS):string[]{
 if(requested===undefined)return [...defaults];
 const disc=process.env.SOCOM_DISC;
 if(!disc||!existsSync(join(disc,'RUN')))throw Error('An explicit map selection requires SOCOM_DISC/RUN');
 return selectValidationMaps(readdirSync(join(disc,'RUN')).map(n=>'RUN/'+n),requested);
}
export function validationMap():string{
 const maps=validationMaps(['MP2'],process.env.S2U_VALIDATION_MAP);
 if(maps.length!==1)throw Error('S2U_VALIDATION_MAP must name exactly one map');
 return maps[0]!;
}
