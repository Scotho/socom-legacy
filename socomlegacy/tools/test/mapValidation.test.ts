import {expect,it} from 'vitest';
import {selectValidationMaps, renderValidationMatrix, type ValidationRow} from '../mapValidation';

it('keeps every discovered variant and rejects a mistyped requested map instead of testing a fallback',()=>{
 expect(selectValidationMaps(['RUN/MP72.ZDB','RUN/MP2.ZDB','RUN/MP21.ZDB','RUN/M01.ZDB'])).toEqual(['MP2','MP21','MP72']);
 expect(selectValidationMaps(['RUN/MP2.ZDB','RUN/MP72.ZDB'],'mp72,MP2,mp72')).toEqual(['MP2','MP72']);
 expect(()=>selectValidationMaps(['RUN/MP2.ZDB'],'MP22')).toThrow('MP22');
 expect(()=>selectValidationMaps(['RUN/MP2.ZDB'],'')).toThrow();
});

it('never upgrades decoded assets or partial server coverage to rendered/physical passes',()=>{
 const rows:ValidationRow[]=[{map:'MP2',assets:{status:'ready',details:[]},server:{status:'not-run',details:[]}},
  {map:'MP72',assets:{status:'gaps',details:['missing original recording']},server:{status:'failed',details:['movement failed']}}];
 const output=renderValidationMatrix(rows);
 expect(output).toContain('| MP2 | ready | not-run | not-run | not-run |');
 expect(output).toContain('| MP72 | gaps | failed | not-run | not-run |');
 expect(output).toContain('missing original recording');
 expect(output).not.toContain('all maps passed');
});
