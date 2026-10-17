import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {LocalBridge} from '../src/main/bridge';
import type {Playback} from '../src/shared/model';
const port=43829;
const open=async(origin='https://xpui.app.spotify.com')=>{const ws=new WebSocket(`ws://127.0.0.1:${port}/v1`,{origin});await once(ws,'open');return ws;};
const auth=async(ws:WebSocket,credentials:Record<string,string>)=>{const response=once(ws,'message');ws.send(JSON.stringify({type:'auth',protocol:1,...credentials}));return JSON.parse((await response)[0].toString());};
test('Loopback bridge validates origin/auth, pairs once, rejects stale snapshots and reconnects with saved token',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lyrics-bridge-'));const snapshots:Playback[]=[],connections:boolean[]=[],commands:string[]=[];
  const bridge=new LocalBridge(dir,{playback:p=>snapshots.push(p),connected:v=>connections.push(v),command:a=>commands.push(a),error:()=>{}},port);
  try{
    await bridge.start();
    await assert.rejects(()=>open('https://evil.example'),/403/);
    const untrusted=await open();const closed=once(untrusted,'close');untrusted.send(JSON.stringify({type:'command',action:'toggle'}));assert.equal((await closed)[0],4001);
    const code=bridge.createPairing(),first=await open(),response=await auth(first,{code});assert.match(response.token,/^[\da-f]{64}$/);
    const payload:Playback={type:'playback',protocol:1,seq:5,revision:'current',track:{uri:'spotify:track:1',title:'Fixture',artist:'Test',album:'Suite',durationMs:20000},positionMs:1000,playing:true};
    first.send(JSON.stringify(payload));first.send(JSON.stringify({...payload,seq:4,revision:'stale'}));first.send(JSON.stringify({type:'command',action:'settings'}));
    await new Promise(r=>setTimeout(r,40));assert.equal(snapshots.length,1);assert.deepEqual(commands,['settings']);
    const retry=await open();const failed=once(retry,'close');retry.send(JSON.stringify({type:'auth',protocol:1,code}));assert.equal((await failed)[0],4001);
    const second=await open();await auth(second,{token:response.token});second.send(JSON.stringify({...payload,seq:1,revision:'new-session'}));await new Promise(r=>setTimeout(r,40));
    assert.equal(snapshots.at(-1)!.revision,'new-session');assert.ok(connections.includes(true));
    await bridge.revoke();const secondClosed=second.readyState===WebSocket.CLOSED?null:once(second,'close');if(secondClosed)await secondClosed;
    const removed=await open();const denied=once(removed,'close');removed.send(JSON.stringify({type:'auth',protocol:1,token:response.token}));assert.equal((await denied)[0],4001);
  }finally{await bridge.stop();await rm(dir,{recursive:true,force:true});}
});
