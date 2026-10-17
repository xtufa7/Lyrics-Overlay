import './shared.css';
import './overlay.css';
import { LyricView } from './lyric-view';
import { PlaybackClock, lineAt, followingLine, directionOf, fontFor } from '../shared/timing';
import type { AppState } from '../shared/model';

const host=document.querySelector<HTMLElement>('#lyrics')!,view=new LyricView(host),clock=new PlaybackClock();
let state:AppState,raf=0,lastSeq=-1,snap=false,lastRevision='';
function draw() {
  if(!state)return;
  const lyrics=state.lyrics,position=clock.position(performance.now())+state.settings.offsetMs+state.trackOffsetMs;
  let index=lyrics?.kind==='plain'?state.plainIndex:lineAt(lyrics?.lines??[],position);
  const line=lyrics?.lines[index]??null;
  const key=`${state.playback?.revision??''}:${lyrics?.fetchedAt}:${index}`;
  void view.show(line,key,snap);snap=false;view.progress(position);
  const s=state.settings,next=document.querySelector<HTMLElement>('#next-line')!,translated=document.querySelector<HTMLElement>('#translation-line')!;
  const nextText=s.showNext?(followingLine(lyrics?.lines??[],index,position)?.text??''):'';
  const translation=s.showTranslation&&index>=0?(state.translations[index]??''):'';
  for(const [node,text,size,opacity] of [[next,nextText,.64,s.nextOpacity],[translated,translation,.68,.8]] as const){
    if(node.textContent!==text)node.textContent=text;
    node.hidden=!text;node.dir=directionOf(text,s.direction);node.style.fontFamily=fontFor(text,s.font);node.style.fontSize=`${Math.max(12,s.fontSize*size)}px`;node.style.opacity=String(opacity*s.opacity);node.style.textAlign=s.align;node.style.color=s.color;
  }
  document.querySelector<HTMLElement>('#overlay-stack')!.style.justifyContent={top:'flex-start',center:'center',bottom:'flex-end'}[s.vertical];
  if(state.connected&&state.playback?.playing&&state.settings.visible&&lyrics?.lines.length&&lyrics.kind!=='plain')raf=requestAnimationFrame(draw);
}
function receive(next:AppState) {
  const previous=state;
  state=next;
  if(next.playback?.seq!==lastSeq||next.playback?.revision!==lastRevision) {
    snap=!next.playback||next.playback.revision!==lastRevision||Math.abs(clock.position(performance.now())-next.playback.positionMs)>700;
    clock.update(next.playback,performance.now());lastSeq=next.playback?.seq??-1;lastRevision=next.playback?.revision??'';
  }
  if(!previous||JSON.stringify(previous.settings)!==JSON.stringify(next.settings))view.configure(next.settings);
  view.setPaused(!!next.playback&&!next.playback.playing);
  document.body.classList.toggle('editing',next.edit);
  document.querySelector('#edit-label')!.textContent=next.edit?`اسحب لتغيير الموضع · ${next.settings.editShortcut} للإنهاء`:'';
  if(!next.connected||!next.lyrics){snap=true;void view.show(null,'empty',true);}
  cancelAnimationFrame(raf);draw();
}
window.overlay.subscribe(receive);window.overlay.getState().then(receive);
document.querySelector('#settings')!.addEventListener('click',()=>window.overlay.action('settings'));
document.querySelector('#done')!.addEventListener('click',()=>window.overlay.action('edit'));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state?.edit)void window.overlay.action('edit');});
const handle=document.querySelector<HTMLElement>('#resize')!;
handle.addEventListener('pointerdown',event=>{handle.setPointerCapture(event.pointerId);void window.overlay.resize(true);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(type,()=>window.overlay.resize(false));
