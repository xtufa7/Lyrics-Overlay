import { createServer, type Server } from 'node:http';
import { randomBytes, randomInt, createHash, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { join } from 'node:path';
import { messageSchema, PORT, PROTOCOL, type Playback } from '../shared/model';
import { atomicJson, readJson } from './store';

const ORIGINS = new Set(['https://xpui.app.spotify.com', 'https://zlink.app.spotify.com']);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type Callbacks = { playback: (p: Playback) => void; connected: (value: boolean) => void; command: (action: 'toggle' | 'settings') => void; error: (message: string) => void };
export class LocalBridge {
  get listening():boolean{return this.server.listening;}
  private server: Server;
  private wss = new WebSocketServer({noServer:true, maxPayload:16*1024, perMessageDeflate:false});
  private tokenHash = '';
  private pairing: {code: string; expires: number} | null = null;
  private active: WebSocket | null = null;
  private failures: number[] = [];
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private stopping = false;
  private stopPromise: Promise<void> | null = null;
  constructor(private dir: string, private callbacks: Callbacks, private port = PORT) {
    this.server = createServer((_req,res)=>{res.writeHead(404);res.end();});
    this.server.on('upgrade',(req,socket,head)=>{
      if (this.stopping || req.url !== '/v1' || !ORIGINS.has(req.headers.origin ?? '') ||
          req.headers.host !== `127.0.0.1:${this.port}` || this.wss.clients.size >= 4) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
      }
      this.wss.handleUpgrade(req,socket,head,ws=>this.wss.emit('connection',ws));
    });
    this.wss.on('connection',ws=>this.connection(ws));
    this.wss.on('error',()=>{if(!this.stopping)this.callbacks.error('The local connection encountered an error.');});
  }
  async start() {
    this.tokenHash = (await readJson(join(this.dir,'pairing.json'),{tokenHash:''})).tokenHash;
    await new Promise<void>((resolve,reject)=>{
      this.server.once('error',reject);
      this.server.listen(this.port,'127.0.0.1',()=>{this.server.removeListener('error',reject);resolve();});
    });
    this.server.on('error',()=>{if(!this.stopping)this.callbacks.error('The local connection stopped. Restart the companion.');});
    this.heartbeat = setInterval(()=>{
      for (const client of this.wss.clients) {
        const state = client as WebSocket & {alive?: boolean};
        if (state.alive === false) { client.terminate(); continue; }
        state.alive = false; client.ping();
      }
    }, 10_000);
    this.heartbeat.unref();
  }
  createPairing(): string { const code = String(randomInt(0,100_000_000)).padStart(8,'0'); this.pairing={code,expires:Date.now()+300000}; return code; }
  async provision(): Promise<string> {
    // Trusted local installer flow: generate a companion-only credential, never a Spotify access token.
    const token=randomBytes(32).toString('hex');this.tokenHash=hash(token);this.pairing=null;
    await atomicJson(join(this.dir,'pairing.json'),{tokenHash:this.tokenHash});
    for(const ws of this.wss.clients)ws.close(4001,'Extension updated');
    return token;
  }
  async revoke() {
    this.tokenHash='';this.pairing=null;
    await atomicJson(join(this.dir,'pairing.json'),{tokenHash:''});
    for (const ws of this.wss.clients) ws.close(4001,'Pairing reset');
  }
  private connection(ws: WebSocket) {
    let authenticated = false, seq = -1, count = 0, windowAt = Date.now();
    const timeout = setTimeout(()=>ws.close(4001,'Authentication required'),8000);
    ws.on('error',()=>{});
    ws.on('pong',()=>{(ws as WebSocket & {alive?:boolean}).alive=true;});
    ws.on('close',()=>{
      clearTimeout(timeout);
      if (this.active === ws) { this.active=null; if(!this.stopping)this.callbacks.connected(false); }
    });
    let queue = Promise.resolve();
    ws.on('message',(buffer,isBinary)=>{
      // Serialize authentication persistence and snapshots; no async interleaving can authenticate twice.
      queue = queue.then(async()=>{
        if (this.stopping || ws.readyState !== WebSocket.OPEN) return;
        if (Date.now()-windowAt>=1000) {count=0;windowAt=Date.now();}
        if (++count>40 || isBinary) {ws.close(4008,'Rate limit');return;}
        let raw: unknown;
        try {raw=JSON.parse(buffer.toString());} catch {ws.close(4002,'Invalid JSON');return;}
        const result = messageSchema.safeParse(raw);
        if (!result.success) {ws.close(4002,'Invalid protocol message');return;}
        const msg = result.data;
        if (!authenticated) {
          if (msg.type !== 'auth') {ws.close(4001,'Authentication required');return;}
          this.failures=this.failures.filter(t=>Date.now()-t<60000);
          if (this.failures.length>=5) {ws.close(4008,'Try pairing again in one minute');return;}
          let token: string | undefined;
          const validToken = msg.token && this.tokenHash && timingSafeEqual(Buffer.from(hash(msg.token)),Buffer.from(this.tokenHash));
          const validCode = msg.code && this.pairing && Date.now()<this.pairing.expires && timingSafeEqual(Buffer.from(msg.code),Buffer.from(this.pairing.code));
          if (!validToken && !validCode) {this.failures.push(Date.now());ws.close(4001,'Pair in companion settings');return;}
          if (validCode) {
            token=randomBytes(32).toString('hex');this.tokenHash=hash(token);this.pairing=null;
            await atomicJson(join(this.dir,'pairing.json'),{tokenHash:this.tokenHash});
          }
          if(this.stopping||ws.readyState!==WebSocket.OPEN)return;
          const previous=this.active;
          this.active=ws;authenticated=true;clearTimeout(timeout);
          if (previous && previous!==ws) previous.close(4000,'Replaced by current Spotify session');
          ws.send(JSON.stringify({type:'ready',protocol:PROTOCOL,...(token ? {token} : {})}));
          this.callbacks.connected(true); return;
        }
        if (this.active!==ws) return;
        if (msg.type==='playback') {
          if (msg.seq<=seq) return;
          seq=msg.seq;this.callbacks.playback(msg);
        } else if (msg.type==='command') this.callbacks.command(msg.action);
      }).catch(()=>{if(this.stopping)return;ws.close(1011,'Local storage error');this.callbacks.error('Could not save the local pairing. Check storage permissions.');});
    });
  }
  stop(): Promise<void> {
    if(this.stopPromise)return this.stopPromise;
    this.stopping=true;this.active=null;
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const ws of this.wss.clients) ws.terminate();
    this.stopPromise=Promise.all([
      new Promise<void>(resolve=>this.wss.close(()=>resolve())),
      new Promise<void>(resolve=>this.server.close(()=>resolve()))
    ]).then(()=>{});
    return this.stopPromise;
  }
}
