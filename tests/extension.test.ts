import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {buildSync} from 'esbuild';
import {randomUUID} from 'node:crypto';

test('Actual bundled extension transmits track, pause, seeks, changes and empty playback through documented APIs',async()=>{
  const code=buildSync({entryPoints:['src/extension/index.ts'],bundle:true,write:false,format:'iife',platform:'browser'}).outputFiles[0]!.text;
  let now=0,position=500,playing=true;
  const messages:Record<string,unknown>[]=[],events=new Map<string,()=>void>(),storedValues:string[]=[];
  let ws:FakeSocket;
  class FakeSocket {
    static OPEN=1;readyState=1;onopen:(()=>void)|null=null;onmessage:((e:{data:string})=>void)|null=null;onclose:((e:{code:number})=>void)|null=null;onerror:(()=>void)|null=null;
    constructor(public address:string){ws=this;queueMicrotask(()=>this.onopen?.());}
    send(raw:string){const msg=JSON.parse(raw);messages.push(msg);if(msg.type==='auth')queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({type:'ready',protocol:1})}));}
    close(){this.readyState=3;}
  }
  const item={uri:'spotify:track:first',name:'First song',artists:[{name:'Original artist'}],album:{name:'Original album'},metadata:{image_url:'spotify:image:ab67616d00001e02f16ab998eea7e598a0928ad7'}};
  const player={data:{item},getProgress:()=>position,getDuration:()=>20000,isPlaying:()=>playing,addEventListener:(key:string,cb:()=>void)=>events.set(key,cb),removeEventListener:(key:string)=>events.delete(key)};
  const win:{__lyricsOverlayCleanup?:()=>void;addEventListener:()=>void}={addEventListener:()=>{}};
  runInNewContext(code,{Spicetify:{Player:player,LocalStorage:{get:()=> 'paired-token',set:(_key:string,value:string)=>storedValues.push(value)},PopupModal:{},showNotification:()=>{}},window:win,crypto:{randomUUID},WebSocket:FakeSocket,performance:{now:()=>now},setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask});
  try{
    await new Promise(r=>setImmediate(r));assert.equal(ws!.address,'ws://127.0.0.1:43827/v1');assert.equal(messages[0]!.token,'paired-token');
    assert.equal(messages[1]!.type,'playback');assert.equal((messages[1]!.track as typeof item).uri,item.uri);
    assert.equal((messages[1]!.track as {artwork:string}).artwork,'https://i.scdn.co/image/ab67616d00001e02f16ab998eea7e598a0928ad7');
    playing=false;events.get('onplaypause')!();assert.equal(messages.at(-1)!.playing,false);
    position=8000;now=100;events.get('onprogress')!();assert.equal(messages.at(-1)!.positionMs,8000);
    const oldRevision=messages.at(-1)!.revision;
    player.data.item={...item,uri:'spotify:track:second',name:'Second song',metadata:{image_url:'http://untrusted.example/track.jpg'}};events.get('songchange')!();assert.notEqual(messages.at(-1)!.revision,oldRevision);assert.equal((messages.at(-1)!.track as {artwork?:string}).artwork,undefined);
    player.data.item={...item,uri:'spotify:episode:unsupported'};events.get('songchange')!();assert.equal(messages.at(-1)!.track,null);
    const snapshots=messages.filter(m=>m.type==='playback');assert.ok(snapshots.every((m,i)=>i===0||(m.seq as number)>(snapshots[i-1]!.seq as number)));
    ws!.onclose?.({code:4001});assert.ok(!storedValues.includes(''),'Reconnect must not erase a shared persisted credential');
  }finally{win.__lyricsOverlayCleanup?.();assert.equal(events.size,0);}
});
test('An unpaired extension waits for a code without consuming authentication attempts',()=>{
  const code=buildSync({entryPoints:['src/extension/index.ts'],bundle:true,write:false,format:'iife',platform:'browser'}).outputFiles[0]!.text;
  let sockets=0;
  const win:{__lyricsOverlayCleanup?:()=>void;addEventListener:()=>void}={addEventListener:()=>{}};
  runInNewContext(code,{
    Spicetify:{Player:{addEventListener:()=>{},removeEventListener:()=>{}},PopupModal:{},LocalStorage:{get:()=>null,set:()=>{}}},
    window:win,WebSocket:class{constructor(){sockets++;}},crypto:{randomUUID},performance:{now:()=>0},setTimeout,clearTimeout,setInterval,clearInterval
  });
  try{assert.equal(sockets,0);}finally{win.__lyricsOverlayCleanup?.();}
});
