import './shared.css';
import './overlay.css';
import './surface.css';
import {configureSurface} from './surface';
import {LyricView} from './lyric-view';
import {PlaybackClock,lineAt,followingLine,directionOf,fontFor} from '../shared/timing';
import type {AppState} from '../shared/model';

const host=document.querySelector<HTMLElement>('#lyrics')!,view=new LyricView(host),clock=new PlaybackClock();
const nextLine=document.querySelector<HTMLElement>('#next-line')!,translationLine=document.querySelector<HTMLElement>('#translation-line')!,artwork=document.querySelector<HTMLImageElement>('#overlay-artwork')!;
let state:AppState,timer:ReturnType<typeof setTimeout>|undefined,lastSeq=-1,lastRevision='',snap=false,auxKey='',settingsVersion=0,failedArtwork='';
function draw(){
 if(!state)return;
 const lyrics=state.lyrics,s=state.settings,position=clock.position(performance.now())+s.offsetMs+state.trackOffsetMs;
 const index=lyrics?.kind==='plain'?state.plainIndex:lineAt(lyrics?.lines??[],position),line=lyrics?.lines[index]??null;
 const key=[state.playback?.revision,lyrics?.fetchedAt,index].join(':');
 void view.show(line,key,snap);snap=false;view.progress(position);
 const translation=s.showTranslation&&index>=0?state.translations[index]??'':'';
 const auxiliaryKey=[key,settingsVersion,translation].join(':');
 if(auxiliaryKey!==auxKey){
  auxKey=auxiliaryKey;
  for(const [node,text] of [[nextLine,s.showNext?followingLine(lyrics?.lines??[],index,position)?.text??'':''],[translationLine,translation]] as const){
   node.textContent=text;node.hidden=!text;node.dir=directionOf(text,s.direction);node.style.fontFamily=fontFor(text,node===translationLine?s.translationFont:s.font);
  }
 }
 if(state.connected&&state.playback?.playing&&(s.visible||state.edit)&&lyrics?.lines.length&&lyrics.kind!=='plain')timer=setTimeout(draw,33);
}
function receive(next:AppState){
 const previous=state;state=next;
 if(next.playback?.seq!==lastSeq||next.playback?.revision!==lastRevision){
  snap=!next.playback||next.playback.revision!==lastRevision||Math.abs(clock.position(performance.now())-next.playback.positionMs)>700;
  clock.update(next.playback,performance.now());lastSeq=next.playback?.seq??-1;lastRevision=next.playback?.revision??'';
 }
 const s=next.settings;
 if(!previous||JSON.stringify(previous.settings)!==JSON.stringify(s)){
  settingsVersion++;view.configure(s);
  configureSurface(document.querySelector<HTMLElement>('#display-surface')!,s);
  for(const [node,size,opacity,color] of [[nextLine,.64,s.nextOpacity,s.color],[translationLine,s.translationSize,s.translationOpacity,s.translationColor]] as const){
   node.style.fontSize=String(Math.max(12,s.fontSize*size))+'px';node.style.opacity=String(opacity*s.opacity);node.style.textAlign=s.align;node.style.color=color;
  }
  translationLine.style.order=s.translationPlacement==='above'?'-1':'1';nextLine.style.order='2';
  translationLine.style.textShadow='0 1px '+s.shadow+'px #0009,0 0 '+s.translationGlow+'px '+(s.translationGlow?s.translationColor:'transparent');
  document.querySelector<HTMLElement>('#overlay-stack')!.style.justifyContent={top:'flex-start',center:'center',bottom:'flex-end'}[s.vertical];
 }
 const image=next.playback?.track?.artwork??'',showArt=!!image&&s.showArtwork&&image!==failedArtwork;
 artwork.hidden=!showArt;document.body.classList.toggle('with-artwork',showArt);
 if(image&&artwork.getAttribute('src')!==image)artwork.src=image;if(!image)artwork.removeAttribute('src');
 view.setPaused(!!next.playback&&!next.playback.playing);document.body.classList.toggle('editing',next.edit);
 document.querySelector('#edit-label')!.textContent=next.edit?'Drag to move · '+s.editShortcut+' to finish':'';
 if(!next.connected||!next.lyrics){snap=true;void view.show(null,'empty',true);}
 clearTimeout(timer);draw();
}
artwork.onerror=()=>{failedArtwork=artwork.getAttribute('src')??'';artwork.hidden=true;document.body.classList.remove('with-artwork');};
window.overlay.subscribe(receive);window.overlay.getState().then(receive);
document.querySelector('#settings')!.addEventListener('click',()=>window.overlay.action('settings'));
document.querySelector('#done')!.addEventListener('click',()=>window.overlay.action('edit'));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state?.edit)void window.overlay.action('edit');});
const handle=document.querySelector<HTMLElement>('#resize')!;
handle.addEventListener('pointerdown',event=>{handle.setPointerCapture(event.pointerId);void window.overlay.resize(true);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(type,()=>window.overlay.resize(false));
window.addEventListener('beforeunload',()=>clearTimeout(timer));
