import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LyricsStore,SettingsStore,trackKey} from '../src/main/store';
import {parseLrc} from '../src/lyrics/parsers';
import type {Track} from '../src/shared/model';
const track:Track={uri:'spotify:track:fixture',title:'Fixture',artist:'Original',album:'Tests',durationMs:20000};
test('Settings persist across restarts and invalid writes cannot alter state',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lyrics-settings-'));
  try{const first=new SettingsStore(dir);await first.load();await first.save({x:-600,y:100,width:780,font:'Cairo'});
    const second=new SettingsStore(dir);await second.load();assert.equal(second.value.x,-600);assert.equal(second.value.font,'Cairo');
    await assert.rejects(()=>second.save({width:0}));assert.equal(second.value.width,780);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('One damaged setting cannot erase saved fonts, position, translation and panel choices',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lyrics-recovery-'));
 try{await writeFile(join(dir,'settings.json'),JSON.stringify({font:'Outfit',width:-1,x:120,translationGlow:8,surface:'glass'}));const store=new SettingsStore(dir);await store.load();assert.equal(store.value.font,'Outfit');assert.equal(store.value.width,680);assert.equal(store.value.x,120);assert.equal(store.value.translationGlow,8);assert.equal(store.value.surface,'glass');}
 finally{await rm(dir,{recursive:true,force:true});}
});
test('Imports override cache, cache avoids network and negative results are cached',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lyrics-cache-'));let calls=0;
  const provider={name:'fixture',find:async()=>{calls++;return parseLrc('[00:01]Online',20000);}};
  try{const store=new LyricsStore(dir,[provider]);await store.initialize();const signal=new AbortController().signal;
    assert.equal((await store.find(track,signal,true))?.lines[0]!.text,'Online');
    await store.find(track,signal,true);assert.equal(calls,1);
    await store.import(track,parseLrc('[00:01]Local',20000));assert.equal((await store.find(track,signal,true,true))?.lines[0]!.text,'Local');assert.equal(calls,1);
    await store.clearImport(track);assert.equal((await store.find(track,signal,false))?.lines[0]!.text,'Online');
    const missing=new LyricsStore(dir,[{name:'none',find:async()=>{calls++;return null;}}]);
    const other={...track,uri:'spotify:track:missing'};await missing.find(other,signal,true);await missing.find(other,signal,true);assert.equal(calls,2);
    assert.notEqual(trackKey(track),trackKey({...track,album:'Different'}));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('Cancelled track lookup never returns or caches stale provider data',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lyrics-abort-'));const controller=new AbortController();
  try{const store=new LyricsStore(dir,[{name:'slow',find:async()=>{controller.abort();return parseLrc('[00:01]Stale');}}]);await store.initialize();
    await assert.rejects(()=>store.find(track,controller.signal,true));
  }finally{await rm(dir,{recursive:true,force:true});}
});
