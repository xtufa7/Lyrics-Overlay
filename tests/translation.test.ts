import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {TranslationEngine,localOllamaUrl,parseTranslations,translationIdentity} from '../src/lyrics/translation';
import {defaults,type Track} from '../src/shared/model';
import {parseLrc} from '../src/lyrics/parsers';
import {followingLine} from '../src/shared/timing';

const track:Track={uri:'spotify:track:translation-fixture',title:'Original fixture',artist:'Tests',album:'Verification',durationMs:20000};
const lyrics=parseLrc('[00:00]The evening finds its rhythm\n[00:05]\n[00:08]And the words find their way',20000);
test('Following cue skips blank timed cues and handles preroll and final line',()=>{
 assert.equal(followingLine(lyrics.lines,0,1000)?.startMs,8000);
 assert.equal(followingLine(lyrics.lines,-1,-1)?.startMs,0);
 assert.equal(followingLine(lyrics.lines,2,10000),null);
});
test('AI output must preserve every requested line id without duplication, omission or invented alignment',()=>{
 const good=parseTranslations('```json\n{"translations":[{"id":0,"text":"يجد المساء إيقاعه"},{"id":2,"text":"وتجد الكلمات طريقها"}]}\n```',[0,2]);
 assert.equal(good.get(2),'وتجد الكلمات طريقها');
 for(const text of ['{"translations":[{"id":0,"text":"A"}]}','{"translations":[{"id":0,"text":"A"},{"id":0,"text":"B"}]}','{"translations":[{"id":0,"text":"A"},{"id":1,"text":"B"}]}'])assert.throws(()=>parseTranslations(text,[0,2]));
});
test('Ollama endpoints are loopback-only and cache identity separates provider/language/model',()=>{
 assert.equal(localOllamaUrl('http://127.0.0.1:11434/'),'http://127.0.0.1:11434');
 for(const url of ['https://evil.example','http://192.168.1.4:11434','http://user:secret@127.0.0.1:11434','http://127.0.0.1:11434/?key=x'])assert.throws(()=>localOllamaUrl(url));
 assert.notEqual(translationIdentity(track,lyrics,defaults),translationIdentity(track,lyrics,{...defaults,translationTarget:'ja'}));
 assert.notEqual(translationIdentity(track,lyrics,defaults),translationIdentity(track,lyrics,{...defaults,translationProvider:'ollama'}));
});
test('Gemini receives song context, key stays in its header, alignment is retained and cache avoids repeat requests',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lyrics-translation-'));let calls=0;
 const request:typeof fetch=async(url,init)=>{
  calls++;assert.match(String(url),/^https:\/\/generativelanguage.googleapis.com\/v1beta\/models\//);
  assert.equal((init?.headers as Record<string,string>)['x-goog-api-key'],'fixture-key');
  assert.ok(!String(url).includes('fixture-key'));const body=JSON.parse(String(init?.body));assert.match(body.systemInstruction.parts[0].text,/idioms/);
  const data=JSON.parse(body.contents[0].parts[0].text);assert.equal(data.song.title,track.title);assert.deepEqual(data.requested.map((l:any)=>l.id),[0,2]);
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({translations:[{id:0,text:'يجد المساء إيقاعه'},{id:2,text:'وتجد الكلمات طريقها'}]})}]}}]});
 };
 try{
  const engine=new TranslationEngine(dir,request),progress:string[][]=[];
  const result=await engine.translate(track,lyrics,defaults,'fixture-key',new AbortController().signal,lines=>progress.push(lines));
  assert.deepEqual(result,['يجد المساء إيقاعه','','وتجد الكلمات طريقها']);assert.equal(calls,1);assert.equal(progress.length,1);
  assert.deepEqual(await engine.translate(track,lyrics,defaults,'different-key',new AbortController().signal,()=>{}),result);assert.equal(calls,1);
  assert.equal(lyrics.lines[2]!.startMs,8000);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Missing AI keys and aborted translations fail without producing fabricated translations',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lyrics-translation-abort-'));
 try{
  const engine=new TranslationEngine(dir,async()=>{throw new Error('Should not contact a service');});
  await assert.rejects(()=>engine.translate(track,lyrics,defaults,'',new AbortController().signal,()=>{}),/مفتاح/);
  const controller=new AbortController();controller.abort();await assert.rejects(()=>engine.translate(track,lyrics,defaults,'fixture',controller.signal,()=>{}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
