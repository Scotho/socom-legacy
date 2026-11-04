import {describe,expect,it} from 'vitest';
import type {DialogDesign} from '@s2u/ui';
import {FrontEndSession,drawsMenuFrame,type FrontEndDisc} from '../src/frontEnd';

// HD-3 review F1: the menus' frame is not drawn at the HD scale while a match holds the menus (its canvas is on top);
// at scale 1 the page draws as it always has.

const design=():DialogDesign=>({libraries:[],usesMemcard:false,font:null,fontLib:true,background:null,bindings:[],controls:[],objects:[],scripts:[],models:[],dropped:[]});
const disc:FrontEndDisc={dialog:(n)=>(n==='dlgMenu.rdr'?design():null),sets:[],faces:[],captions:null,loader:{},missing:[]};

describe('HD-3: the hidden menu frame (review F1)',()=>{
  it('a session says whether a match holds its menus',()=>{
    const s=new FrontEndSession({disc,startDialog:'dlgMenu.rdr'});
    expect(s.menusHidden).toBe(false);
    s.holdMenus(true);expect(s.menusHidden).toBe(true);
    s.holdMenus(false);expect(s.menusHidden).toBe(false);
  });
  it('the frame is drawn unless the menus are held at an HD scale: scale 1 draws as before, held or not',()=>{
    expect(drawsMenuFrame({menusHidden:false},4)).toBe(true);
    expect(drawsMenuFrame({menusHidden:true},4)).toBe(false);
    expect(drawsMenuFrame({menusHidden:true},1)).toBe(true);
    expect(drawsMenuFrame({menusHidden:false},1)).toBe(true);
  });
});
