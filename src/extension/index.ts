import {PORT,PROTOCOL} from '../shared/protocol';
import type {Playback,Track} from '../shared/model';

type Item = {uri?:string;name?:string;duration?:{milliseconds?:number};artists?:{name:string}[];album?:{name?:string};metadata?:Record<string,string>};
interface SpicetifyApi {
  Player: {data?:{item?:Item};getProgress():number;getDuration():number;isPlaying():boolean;addEventListener(event:string,callback:()=>void):void;removeEventListener(event:string,callback:()=>void):void};
  Topbar?:{Button:new(label:string,icon:string,onClick:()=>void)=>{element:HTMLElement}};
  PopupModal:{display(options:{title:string;content:HTMLElement;isLarge?:boolean}):void;hide():void};
  LocalStorage:{get(key:string):string|null;set(key:string,value:string):void};
  showNotification(message:string,error?:boolean):void;
}
declare const Spicetify: SpicetifyApi;
declare global {interface Window { __lyricsOverlayCleanup?:()=>void }}

function boot() {
  if (typeof Spicetify==='undefined' || !Spicetify.Player || !Spicetify.PopupModal) {setTimeout(boot,500);return;}
  window.__lyricsOverlayCleanup?.();
  let socket: WebSocket | null = null, ready=false, stopped=false, retry=1000, seq=0, lastSent=0, lastPosition=0, lastAt=performance.now();
  let revision=crypto.randomUUID(), lastUri='', reconnect:ReturnType<typeof setTimeout>|undefined, openingCode:string|undefined;
  const storageKey='lyrics-overlay:pair-token:v1';
  let token=Spicetify.LocalStorage.get(storageKey) ?? '';
  const bootstrap='__LYRICS_OVERLAY_LOCAL_TOKEN__';
  if(/^[a-f0-9]{64}$/.test(bootstrap)&&Spicetify.LocalStorage.get(`${storageKey}:bootstrap`)!==bootstrap){
    token=bootstrap;Spicetify.LocalStorage.set(storageKey,token);Spicetify.LocalStorage.set(`${storageKey}:bootstrap`,bootstrap);
  }
  const send=(msg:unknown)=>{if (ready && socket?.readyState===WebSocket.OPEN) socket.send(JSON.stringify(msg));};
  function track():Track|null {
    const item=Spicetify.Player.data?.item, m=item?.metadata ?? {};
    if (!item?.uri || !item.uri.startsWith('spotify:track:') && !item.uri.startsWith('spotify:local:')) return null;
    const title=item.name || m.title || '', artist=item.artists?.map(a=>a.name).join(', ') || m.artist_name || '';
    if (!title || !artist) return null;
    const durationMs=Spicetify.Player.getDuration();
    if (!Number.isFinite(durationMs) || durationMs<=0) return null;
    const image=m.image_url||m.image_large_url||m.image_xlarge_url||'';
    const candidate=image.startsWith('spotify:image:')?`https://i.scdn.co/image/${image.slice('spotify:image:'.length)}`:image;
    const artwork=/^https:\/\/i\.scdn\.co\/image\/[a-f\d]{20,80}$/i.test(candidate)?candidate:undefined;
    return {uri:item.uri,title,artist,album:item.album?.name || m.album_title || '',durationMs,...artwork?{artwork}:{}};
  }
  function snapshot(force=false) {
    if (!ready) return;
    const current=track(), uri=current?.uri ?? '';
    if (uri!==lastUri) {lastUri=uri;revision=crypto.randomUUID();force=true;}
    const now=performance.now(), positionMs=Math.max(0,Spicetify.Player.getProgress() || 0), playing=!!current && Spicetify.Player.isPlaying();
    const expected=lastPosition+(playing ? now-lastAt : 0);
    const seek=Math.abs(positionMs-expected)>650;
    if (!force && !seek && now-lastSent<2000) return;
    lastSent=now;lastPosition=positionMs;lastAt=now;
    const payload:Playback={type:'playback',protocol:PROTOCOL,seq:++seq,revision,track:current,positionMs,playing};
    send(payload);
  }
  function connect() {
    if (stopped || (!token && !openingCode)) return;
    ready=false;
    const ws=new WebSocket(`ws://127.0.0.1:${PORT}/v1`);socket=ws;
    ws.onopen=()=>ws.send(JSON.stringify({type:'auth',protocol:PROTOCOL,...(openingCode ? {code:openingCode} : {token})}));
    ws.onmessage=event=>{
      if(socket!==ws)return;
      let msg: {type?:string;token?:string};try {msg=JSON.parse(event.data);} catch {return;}
      if (msg.type==='ready') {
        if (msg.token) {token=msg.token;Spicetify.LocalStorage.set(storageKey,token);}
        openingCode=undefined;ready=true;retry=1000;snapshot(true);
      }
    };
    ws.onerror=()=>{};
    ws.onclose=event=>{
      if (socket!==ws) return;
      ready=false;
      if (event.code===4001) {
        openingCode=undefined;token='';Spicetify.LocalStorage.set(storageKey,'');
        // An unpaired extension waits for an explicit code instead of consuming pairing attempts.
        return;
      }
      if (event.code===4000) {stopped=true;return;}
      clearTimeout(reconnect);
      reconnect=setTimeout(connect,retry+Math.random()*500);retry=Math.min(30000,retry*1.7);
    };
  }
  function panel() {
    const root=document.createElement('div');root.style.cssText='display:grid;gap:16px;padding:12px;color:var(--spice-text)';
    const desc=document.createElement('p');desc.textContent=ready ? 'Connected · Lyrics Overlay by 0xTuFa7' : 'Open Lyrics Overlay and click Connect Spotify. The extension pairs automatically. Manual pairing below is a fallback.';
    const code=document.createElement('input');code.placeholder='8-digit pairing code';code.maxLength=8;code.inputMode='numeric';code.style.cssText='padding:12px;border-radius:6px;background:#222;color:#fff;border:1px solid #666';
    const status=document.createElement('p');status.setAttribute('role','status');
    function button(label:string,run:()=>void) {const b=document.createElement('button');b.textContent=label;b.style.cssText='padding:12px 18px;background:#b8ffd5;color:#102017;border:0;border-radius:24px;font-weight:600;cursor:pointer';b.onclick=run;root.append(b);}
    root.append(desc,code);
    button('Pair with companion',()=>{
      if (!/^\d{8}$/.test(code.value.trim())) {status.textContent='Enter all 8 digits.';return;}
      openingCode=code.value.trim();stopped=false;clearTimeout(reconnect);
      if(socket){socket.onclose=null;socket.close();}connect();status.textContent='Connecting…';
      setTimeout(()=>{status.textContent=ready ? 'Paired. You can close this dialog.' : 'Not connected. Check the companion and code, then try again.';},2000);
    });
    button('Show / hide overlay',()=>{if(ready)send({type:'command',action:'toggle'});else status.textContent='Pair the companion first.';});
    button('Open desktop settings',()=>{if(ready)send({type:'command',action:'settings'});else status.textContent='Pair the companion first.';});
    root.append(status);
    Spicetify.PopupModal.display({title:'Lyrics Overlay',content:root});
  }
  const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10h10M9 14h6"/></svg>';
  const button=Spicetify.Topbar?.Button ? new Spicetify.Topbar.Button('Lyrics Overlay',icon,panel) : null;
  const change=()=>{revision=crypto.randomUUID();snapshot(true);};
  const update=()=>snapshot(true),progress=()=>snapshot();
  Spicetify.Player.addEventListener('songchange',change);
  Spicetify.Player.addEventListener('onplaypause',update);
  Spicetify.Player.addEventListener('onprogress',progress);
  // Low-rate correction survives builds that suppress onprogress while Spotify is minimized.
  const correction=setInterval(()=>snapshot(),2000);
  connect();
  const cleanup=()=>{
    stopped=true;clearTimeout(reconnect);clearInterval(correction);socket?.close();
    Spicetify.Player.removeEventListener('songchange',change);Spicetify.Player.removeEventListener('onplaypause',update);Spicetify.Player.removeEventListener('onprogress',progress);button?.element?.remove();
  };
  window.__lyricsOverlayCleanup=cleanup;
  window.addEventListener('beforeunload',cleanup,{once:true});
}
boot();
