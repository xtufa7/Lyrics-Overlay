import './shared.css';
import './settings.css';
import {LyricView} from './lyric-view';
import {PlaybackClock,lineAt,followingLine,directionOf,fontFor} from '../shared/timing';
import {defaults,type Settings,type AppState,type LyricLine,type OverlayAPI} from '../shared/model';
import {developer} from '../shared/developer';
import {startTour} from './tour';

const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const iconPaths:Record<string,string>={
  wave:'<path d="M2 12h2l3-7 4 14 4-14 3 7h4"/>',home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  sliders:'<path d="M4 6h5m4 0h7M4 12h11m4 0h1M4 18h2m4 0h10"/><circle cx="11" cy="6" r="2"/><circle cx="17" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  move:'<path d="M12 3v18M3 12h18m-12-6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/>',
  translate:'<path d="M3 5h12M9 3v2m4 0c0 7-7 11-10 11m2-8c1 3 4 6 8 8m1 5 4-11 4 11m-7-3h6"/>',
  lyrics:'<path d="M4 5h16M4 10h16M4 15h10M4 20h7"/>',person:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-3c0-4 16-4 16 0v3"/>',
  github:'<path d="M8 21v-4c-4 1-5-2-5-2m13 6v-4c0-1-1-2-1-2 4 0 7-2 7-6 0-2-1-3-2-4 0-1 0-2-1-3-2 0-3 1-3 1-3-1-5-1-8 0 0 0-1-1-3-1-1 1-1 2-1 3-1 1-2 2-2 4 0 4 3 6 7 6 0 0-1 1-1 2"/>',
  arrow:'<path d="M6 18 18 6M6 6h12v12"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  check:'<path d="m5 12 4 4L20 5"/>',spotify:'<circle cx="12" cy="12" r="10"/><path d="M6 9c4-2 8-2 12 0M7 12c3-1 7-1 10 1m-9 2c2-1 5-1 8 1"/>',
  link:'<path d="m9 15 6-6m-7 3-3 3a4 4 0 0 0 6 6l3-3m2-6 3-3a4 4 0 0 0-6-6L10 6"/>',pin:'<path d="m8 3 8 0-1 6 4 4v2H5v-2l4-4Zm4 12v7"/>',
  music:'<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',
  'align-top':'<path d="M3 4h18M8 9h8v11H8Z"/>','align-center':'<path d="M3 12h4m10 0h4M8 5h8v14H8Z"/>','align-bottom':'<path d="M3 20h18M8 4h8v11H8Z"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10v1"/>',
  refresh:'<path d="M20 5v6h-6M4 19v-6h6M4 8a8 8 0 0 1 14-4l2 2M4 18l2 2a8 8 0 0 0 14-4"/>',
  fade:'<circle cx="12" cy="12" r="8" stroke-dasharray="2 4"/><circle cx="12" cy="12" r="3"/>',minimal:'<path d="M4 12h16"/>',dynamic:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
  globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',instagram:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17 7h.1"/>',x:'<path d="M4 3h5l11 18h-5ZM20 3 4 21"/>'
};
function icon(name:string):string{return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name]??iconPaths.wave}</svg>`;}
for(const el of document.querySelectorAll<HTMLElement>('[data-icon]'))el.innerHTML=icon(el.dataset.icon!);
const drag=document.createElement('div');drag.className='window-dragbar';document.body.prepend(drag);
const clock=new PlaybackClock(),preview=new LyricView($('#preview'));
let state:AppState,lastSeq=-1,lastRevision='',language='en',previewManual=false,demoStart=performance.now(),plainKey='',selectedTab='home',feedbackTimer:ReturnType<typeof setTimeout>|undefined;
const timers=new Map<string,ReturnType<typeof setTimeout>>();
let tourStarted=false;
const languages:[string,string][]=[['ar','Arabic'],['en','English'],['fa','Persian'],['ur','Urdu'],['he','Hebrew'],['ja','Japanese'],['ko','Korean'],['zh','Chinese'],['fr','French'],['es','Spanish'],['de','German'],['tr','Turkish']];
type Spec={key:keyof Settings;label:string;type:'range'|'select'|'number'|'color'|'checkbox'|'text'|'shortcut';min?:number;max?:number;step?:number;unit?:string;options?:[string,string][]};
const specs:Record<string,Spec[]>={
 highlight:[{key:'wordHighlight',label:'Word highlight',type:'select',options:[['word','Current word'],['sweep','Progressive sweep'],['off','Off']]},{key:'wordTiming',label:'Word timing',type:'select',options:[['estimate','Estimate when needed'],['exact','Exact timestamps only']]},{key:'wordUnderline',label:'Moving underline',type:'checkbox'}],
 'translation-look':[{key:'translationFont',label:'Translation font',type:'select',options:[['auto','Automatic by language'],['Inter','Inter'],['Cairo','Cairo'],['Noto Sans JP','Noto Sans JP'],['Segoe UI','Segoe UI']]},{key:'translationSize',label:'Size relative to original',type:'range',min:.5,max:1.2,step:.05},{key:'translationColor',label:'Translation color',type:'color'},{key:'translationOpacity',label:'Translation opacity',type:'range',min:.2,max:1,step:.05},{key:'translationPlacement',label:'Translation position',type:'select',options:[['below','Below original'],['above','Above original']]}],
 typography:[{key:'font',label:'Font',type:'select',options:[['auto','Automatic by language'],['Cairo','Cairo · Arabic'],['Inter','Inter'],['Noto Sans JP','Noto Sans JP · Japanese'],['Segoe UI','Segoe UI']]},{key:'fontWeight',label:'Font weight',type:'select',options:[['400','Regular'],['500','Medium'],['600','Semibold'],['700','Bold']]},{key:'fontSize',label:'Lyric size',type:'range',min:12,max:80,step:1,unit:'px'},{key:'lines',label:'Long lines',type:'select',options:[['one','One line'],['two','Wrap to two lines']]},{key:'color',label:'Text color',type:'color'},{key:'highlight',label:'Highlight color',type:'color'}],
 surface:[{key:'opacity',label:'Text opacity',type:'range',min:.1,max:1,step:.05},{key:'shadow',label:'Text shadow',type:'range',min:0,max:20,step:1,unit:'px'},{key:'glow',label:'Glow',type:'range',min:0,max:30,step:1,unit:'px'},{key:'nextOpacity',label:'Next-line opacity',type:'range',min:.1,max:.8,step:.05}],
 motion:[{key:'entranceMs',label:'Entrance duration',type:'range',min:0,max:2000,step:20,unit:'ms'},{key:'exitMs',label:'Exit duration',type:'range',min:0,max:1000,step:20,unit:'ms'},{key:'holdMs',label:'Hold before changing',type:'range',min:0,max:1000,step:20,unit:'ms'},{key:'reducedMotion',label:'Reduce motion',type:'checkbox'}],
 language:[{key:'direction',label:'Lyric direction',type:'select',options:[['auto','Automatic per line'],['rtl','Right to left'],['ltr','Left to right']]},{key:'showNext',label:'Show next line',type:'checkbox'}],
 placement:[{key:'width',label:'Overlay width',type:'number',min:240,max:2400,step:10,unit:'px'},{key:'height',label:'Overlay height',type:'number',min:40,max:600,step:5,unit:'px'},{key:'align',label:'Text alignment',type:'select',options:[['center','Center'],['right','Right'],['left','Left']]},{key:'vertical',label:'Vertical placement',type:'select',options:[['center','Center'],['top','Top'],['bottom','Bottom']]},{key:'monitor',label:'Display',type:'select',options:[['primary','Primary display']]},{key:'x',label:'Horizontal position X',type:'number',min:-50000,max:50000,step:1,unit:'px'},{key:'y',label:'Vertical position Y',type:'number',min:-50000,max:50000,step:1,unit:'px'}],
 shortcut:[{key:'visibilityShortcut',label:'Show / hide lyrics',type:'shortcut'},{key:'positionShortcut',label:'Show at saved position',type:'shortcut'},{key:'editShortcut',label:'Move & resize',type:'shortcut'},{key:'autoStart',label:'Start with Windows',type:'checkbox'}],
 translation:[{key:'translationTarget',label:'Translate to',type:'select',options:languages},{key:'translationSource',label:'Source language',type:'select',options:[['auto','Automatic'],...languages]},{key:'translationModel',label:'AI model',type:'text'},{key:'translationStyle',label:'AI translation style',type:'select',options:[['natural','Natural & fluent'],['faithful','Close to the original'],['poetic','Poetic, same meaning']]},{key:'showTranslation',label:'Show translated line',type:'checkbox'}],
 ollama:[{key:'ollamaUrl',label:'Local Ollama server',type:'text'}],
 lyrics:[{key:'onlineLyrics',label:'Find lyrics with LRCLIB',type:'checkbox'},{key:'offsetMs',label:'Global lyric offset',type:'number',min:-30000,max:30000,step:50,unit:'ms'}]
};
specs.translation![0]!.options=[['auto','Automatic · Arabic ↔ English'],...languages];
specs.language!.push({key:'showArtwork',label:'Show album cover',type:'checkbox'});
specs['translation-look']!.push({key:'translationGlow',label:'Translation glow',type:'range',min:0,max:24,step:1,unit:'px'});
function prettyShortcut(value:string){return value.replace(/Control/g,'Ctrl').replace(/\+/g,' + ');}
function feedback(text:string,error=false){const el=$('#feedback');el.textContent=text;el.hidden=!text;el.classList.toggle('error',error);clearTimeout(feedbackTimer);if(!error)feedbackTimer=setTimeout(()=>{el.hidden=true;},8000);}
function errorText(e:unknown){return String(e).replace(/^Error: Error invoking remote method '[^']+': Error: /,'').replace(/^Error: /,'');}
async function save(patch:Partial<Settings>){$('#save-status').textContent='Saving…';try{await window.overlay.updateSettings(patch);$('#save-status').textContent='Saved on this device';}catch(e){feedback(errorText(e),true);$('#save-status').textContent='Could not save settings';}}
for(const [group,items] of Object.entries(specs)){
 const host=group==='ollama'?$('#ollama-fields'):$(`#${group}-controls`);
 for(const spec of items){
  const field=document.createElement('div');field.className=`field ${spec.type==='checkbox'?'checkbox':''}`;field.dataset.field=spec.key;
  const label=document.createElement('label');label.htmlFor=`setting-${spec.key}`;label.textContent=spec.label;
  const output=document.createElement('span');output.className='unit';label.append(output);
  const input=spec.type==='select'?document.createElement('select'):document.createElement('input');input.id=`setting-${spec.key}`;input.dataset.setting=spec.key;
  if(input instanceof HTMLSelectElement)for(const [value,text] of spec.options??[])input.append(new Option(text,value));
  else{input.type=spec.type==='shortcut'?'text':spec.type;if(spec.min!==undefined)input.min=String(spec.min);if(spec.max!==undefined)input.max=String(spec.max);if(spec.step)input.step=String(spec.step);}
  if(spec.type==='shortcut'&&input instanceof HTMLInputElement){
   input.readOnly=true;input.title='Click, then press a combination with Ctrl, Alt or Shift';
   input.addEventListener('keydown',event=>{
    if(event.key==='Tab')return;event.preventDefault();
    if(event.key==='Escape'){input.blur();return;}
    if(['Control','Alt','Shift','Meta'].includes(event.key)||!event.ctrlKey&&!event.altKey&&!event.shiftKey)return;
    const key=event.key.length===1?event.key.toUpperCase():event.key===' '?'Space':event.key;
    const accelerator=[event.ctrlKey?'Control':'',event.altKey?'Alt':'',event.shiftKey?'Shift':'',key].filter(Boolean).join('+');
    input.value=prettyShortcut(accelerator);void save({[spec.key]:accelerator});input.blur();
   });
  }else{
   const event=spec.type==='range'||spec.type==='color'?'input':'change';
   input.addEventListener(event,()=>{
    let value:unknown=input instanceof HTMLInputElement&&input.type==='checkbox'?input.checked:typeof defaults[spec.key]==='number'?Number(input.value):input.value;
    if(spec.key==='x'||spec.key==='y')value=input.value===''?null:Number(input.value);
    if(typeof value==='number'&&!Number.isFinite(value))return;
    output.textContent=spec.type==='range'?`${value}${spec.unit?' '+spec.unit:''}`:spec.unit??'';
    if(state){state.settings={...state.settings,[spec.key]:value};previewStyleVersion++;preview.configure(state.settings);sizePreview();}
    clearTimeout(timers.get(spec.key));timers.set(spec.key,setTimeout(()=>void save({[spec.key]:value}),event==='input'?100:0));
   });
  }
  field.append(label,input);host.append(field);
 }
}
for(const [id,name,description] of [['slide','move','Slide'],['fade','fade','Fade'],['karaoke','wave','Karaoke'],['minimal','minimal','Minimal'],['dynamic','dynamic','Dynamic']] as const){
 const b=document.createElement('button');b.className='preset';b.dataset.preset=id;b.innerHTML=icon(name);const label=document.createElement('span');label.textContent=description;b.append(label);b.onclick=()=>{void save({preset:id}).then(replay);};$('#presets').append(b);
}
const themes=[['midnight','Midnight',['#1d1d2d','#bcb5ff','#a5e7d0'],'#bcb5ff'],['graphite','Graphite',['#161719','#727c88','#ecedef'],'#dce3ee'],['ocean','Ocean',['#101e2b','#399ed3','#b5ecff'],'#80cefa'],['forest','Forest',['#15221e','#54836a','#b9e6bf'],'#9bd7ae'],['light','Daylight',['#eeeeF7','#fff','#7a69bd'],'#c5b8ff']] as const;
for(const [id,label,colors,highlight] of themes){
 const b=document.createElement('button');b.className='theme';b.dataset.theme=id;b.setAttribute('aria-label',`${label} theme`);
 const swatch=document.createElement('span');swatch.className='theme-swatch';for(const color of colors){const i=document.createElement('i');i.style.backgroundColor=color;swatch.append(i);}
 const text=document.createElement('span');text.textContent=label;b.append(swatch,text);b.onclick=()=>void save({theme:id,highlight});$('#themes').append(b);
}
function replay(){previewManual=true;language='en';$<HTMLSelectElement>('#preview-language').value=language;demoStart=performance.now();demoKey='';preview.replay();scheduleFrame();}
$('#replay-motion').onclick=replay;
for(const [id,name,caption] of [['gemini','Gemini','Context-aware AI'],['ollama','Ollama','Local AI'],['mymemory','MyMemory','Basic · no API key']] as const){
 const b=document.createElement('button');b.className='provider';b.dataset.provider=id;const title=document.createElement('strong');title.textContent=name;title.dir='ltr';const desc=document.createElement('span');desc.textContent=caption;b.append(title,desc);b.onclick=()=>void save({translationProvider:id,...id==='gemini'?{translationModel:'gemini-3.8-flash'}:id==='ollama'?{translationModel:'qwen3:8b'}:{}});$('#providers').append(b);
}
const titles:Record<string,[string,string]>={home:['Your words. Your space.','Lyrics above your apps. Nothing in the way.'],appearance:['Make it yours.','Themes, typography and motion. Preview every change.'],position:['Right where you want it.','Save a position. Bring it back with one shortcut.'],translation:['Meaning, in time.','Tune the translation and how it appears.'],lyrics:['Every line, on time.','Lyric sources, local files and synchronization.'],about:['About','Built by xtufa7. Find me around the web.']};
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-tab]'))b.onclick=()=>{
 selectedTab=b.dataset.tab!;for(const el of document.querySelectorAll('[data-tab]'))el.classList.toggle('active',el===b);
 for(const el of document.querySelectorAll('.tab'))el.classList.toggle('active',el.id===`tab-${selectedTab}`);
 $('#page-title').textContent=titles[selectedTab]![0];$('#page-subtitle').textContent=titles[selectedTab]![1];$('.content').scrollTop=0;
 document.body.classList.toggle('about-page',selectedTab==='about');scheduleFrame();
};
async function action(name:Parameters<OverlayAPI['action']>[0],option?:string){try{const response=await window.overlay.action(name,option);if(response)feedback(response);return response;}catch(e){feedback(errorText(e),true);return null;}}
for(const [selector,name] of [['#toggle','toggle'],['#edit','edit'],['#save-position','savePosition'],['#restore-position','restorePosition'],['#reset-position','resetPosition'],['#refresh','refresh'],['#clear-import','clearImport'],['#reset-pairing','resetPairing'],['#translate','translate'],['#cancel-translation','cancelTranslation']] as const)$(selector).onclick=()=>void action(name);
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-place]'))b.onclick=()=>void action('place',b.dataset.place);
$('#import').onclick=()=>void action('import',$<HTMLInputElement>('#ttml-absolute').checked?'absolute':'relative');
$('#pair').onclick=async()=>{const code=await action('pair');if(code){$('#pair-code').textContent=code;feedback('Enter this code from the Lyrics Overlay button in Spotify within five minutes.');}};
$('#install').onclick=()=>void action('install');
$('#repository').onclick=()=>void action('openLink','repository');$('#get-key').onclick=()=>void action('openLink','geminiKey');
$('#start-tour').onclick=startTour;
$('#quick-translation').onclick=()=>void save({showTranslation:!state.settings.showTranslation});
$('#save-key').onclick=async()=>{const input=$<HTMLInputElement>('#translation-key');try{await window.overlay.setTranslationKey(input.value);input.value='';feedback('API key saved with Windows encryption.');}catch(e){feedback(errorText(e),true);}};
$('#clear-key').onclick=async()=>{try{await window.overlay.setTranslationKey('');$<HTMLInputElement>('#translation-key').value='';feedback('Saved API key removed.');}catch(e){feedback(errorText(e),true);}};
$('#track-offset').addEventListener('change',async()=>{try{await window.overlay.setTrackOffset($<HTMLInputElement>('#track-offset').valueAsNumber);}catch(e){feedback(errorText(e),true);}});
$('#preview-language').addEventListener('change',()=>{previewManual=true;language=$<HTMLSelectElement>('#preview-language').value;demoStart=performance.now();scheduleFrame();});
for(const [key,name,symbol] of [['github','GitHub · xtufa7','github'],['website','Website · xtufa7','globe']] as const){
 const b=document.createElement('button');b.dataset.developerLink=key;b.innerHTML=icon(symbol);const span=document.createElement('span');span.textContent=name;b.append(span);b.onclick=()=>void action('openLink',key);$('#developer-links').append(b);
}
window.overlay.displays().then(displays=>{const select=$<HTMLSelectElement>('#setting-monitor');for(const d of displays)select.append(new Option(d.label,d.id));}).catch(()=>{});
function sizePreview(){const s=state?.settings??defaults,stage=$('#preview-stage'),space=$('#preview-space');stage.style.width=`${s.width}px`;stage.style.height=`${s.height}px`;stage.style.transform=`scale(${Math.min(1,(space.clientWidth-30)/s.width,138/s.height)})`;$('#dimensions').textContent=`${s.width} × ${s.height}`;}
new ResizeObserver(sizePreview).observe($('#preview-space'));
function receive(next:AppState){
 const oldSettings=state?.settings;state=next;
 document.documentElement.dataset.theme=next.settings.theme;
 for(const el of document.querySelectorAll<HTMLElement>('[data-theme]')){const selected=el.dataset.theme===next.settings.theme;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));}
 if(!previewManual){language=next.connected?'current':'en';$<HTMLSelectElement>('#preview-language').value=language;}
 if(next.playback?.seq!==lastSeq||next.playback?.revision!==lastRevision){clock.update(next.playback,performance.now());lastSeq=next.playback?.seq??-1;lastRevision=next.playback?.revision??'';}
 for(const [key,value] of Object.entries(next.settings)){
  const el=document.querySelector<HTMLInputElement|HTMLSelectElement>(`[data-setting="${key}"]`);if(!el||document.activeElement===el)continue;
  if(el instanceof HTMLInputElement&&el.type==='checkbox')el.checked=!!value;else el.value=value===null?'':key.endsWith('Shortcut')?prettyShortcut(String(value)):String(value);
  const spec=Object.values(specs).flat().find(s=>s.key===key),out=el.parentElement?.querySelector('.unit');if(out&&spec)out.textContent=spec.type==='range'?`${value}${spec.unit?' '+spec.unit:''}`:spec.unit??'';
 }
 for(const el of document.querySelectorAll<HTMLElement>('[data-preset]')){const selected=el.dataset.preset===next.settings.preset;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));}
 for(const el of document.querySelectorAll<HTMLElement>('[data-provider]')){const selected=el.dataset.provider===next.settings.translationProvider;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));}
 $('#toggle span')!.textContent=next.settings.visible?'Hide lyrics':'Show lyrics';$('#toggle').classList.toggle('off',!next.settings.visible);$('#toggle').setAttribute('aria-pressed',String(next.settings.visible));
 $('#quick-translation').textContent=next.settings.showTranslation?'Translation on':'Translation off';$('#quick-translation').setAttribute('aria-pressed',String(next.settings.showTranslation));
 for(const image of document.querySelectorAll<HTMLImageElement>('[data-artwork]')){
  const src=next.playback?.track?.artwork??'';
  image.hidden=!src||image.dataset.failed===src;image.onerror=()=>{image.hidden=true;image.dataset.failed=src;};if(src&&image.getAttribute('src')!==src){delete image.dataset.failed;image.src=src;}if(!src)image.removeAttribute('src');
 }
 $('#edit span')!.textContent=next.edit?'Done editing':'Move & resize';
 $('#connection-label').classList.toggle('online',next.connected);$('#connection-text').textContent=next.connected?'Spotify connected':'Spotify disconnected';
 $('#connection-badge').textContent=next.connected?'Connected':'Disconnected';$('#connection-badge').classList.toggle('online',next.connected);
 $('#setup-heading').textContent=next.connected?'Connected. Ready to play.':next.connectionPhase==='installing'?'Setting up Spotify…':'Connect your music.';
 $('#setup-status').textContent=next.setupStatus;
 $<HTMLButtonElement>('#install').disabled=next.connectionPhase==='installing';$('#install span')!.textContent=next.connectionPhase==='installing'?'Connecting…':next.connected?'Repair connection':'Connect Spotify';
 $('#position-key').textContent=prettyShortcut(next.settings.positionShortcut);
 const saved=next.settings.savedPosition;$('#saved-place-note').textContent=saved?`Saved position: X ${saved.x} · Y ${saved.y} · ${saved.width} × ${saved.height}`:'No saved position yet. Use Save position on Home.';
 for(const el of document.querySelectorAll('[data-track-title]'))el.textContent=next.playback?.track?.title??'No track playing';
 for(const el of document.querySelectorAll('[data-track-artist]'))el.textContent=next.playback?.track?`${next.playback.track.artist} · ${next.playback.track.album}`:'Connect Spotify and play a song.';
 for(const el of document.querySelectorAll('[data-lyrics-status]'))el.textContent=next.status;
 $('#playback-state').textContent=next.playback?.playing?'Playing':next.playback?.track?'Paused':'Waiting for music';
 if(document.activeElement!==$('#track-offset'))$<HTMLInputElement>('#track-offset').value=String(next.trackOffsetMs);
 $('#warnings').hidden=!next.warnings.length;$('#warnings').textContent=next.warnings.join('\n');
 $('#key-status').textContent=next.translationKeySet?'Encrypted on this device':'Not added';
 $('#translation-status').textContent=next.translationStatus;
 const provider=next.settings.translationProvider;$('#gemini-secret').hidden=provider!=='gemini';$('#ollama-fields').hidden=provider!=='ollama';
 $('[data-field="translationModel"]').hidden=provider==='mymemory';
 $('[data-field="translationStyle"]').hidden=provider==='mymemory';
 $('#timing-note').textContent=next.settings.wordHighlight==='off'?'Only the words. Everything else is transparent.':next.lyrics?.kind==='synced'&&next.settings.wordTiming==='estimate'?'Word motion estimated from line timing':'Real word timing when available';
 $('#provider-note').textContent=provider==='gemini'?'Use a model available to your account. Your own key is required; Google usage limits and billing apply.':provider==='ollama'?'Run Ollama with your chosen model. Local loopback addresses only; no API key required.':'Basic translation with service limits. Choose the source language manually if needed. Use AI for more context.';
 $<HTMLButtonElement>('#translate').disabled=!next.lyrics?.lines.length;
 $('#plain-section').hidden=next.lyrics?.kind!=='plain';const pk=next.lyrics?.kind==='plain'?`${next.lyrics.fetchedAt}:${next.plainIndex}`:'';
 if(pk!==plainKey){plainKey=pk;$('#plain-lines').replaceChildren();if(next.lyrics?.kind==='plain')next.lyrics.lines.forEach((line,i)=>{const b=document.createElement('button');b.textContent=line.text;b.dir='auto';b.classList.toggle('selected',i===next.plainIndex);b.onclick=()=>void action('selectPlain',String(i));$('#plain-lines').append(b);});}
 if(!oldSettings||JSON.stringify(oldSettings)!==JSON.stringify(next.settings)){previewStyleVersion++;preview.configure(next.settings);sizePreview();}
 scheduleFrame();
 if(!tourStarted&&!next.settings.tourComplete){tourStarted=true;setTimeout(startTour,500);}
}
const samples:Record<string,string[]>={ar:['دع الموسيقى تضيء هذا المساء','وتسافر الكلمات معنا إلى البعيد'],en:['Let the evening find its rhythm','And the words will find their way'],ja:['音楽とともに 夜を歩こう','言葉は静かに 心へ届く'],mixed:['هذا المساء feels like home 2026','نترك الكلمات follow the music']};
const sampleTranslations:Record<string,string[]>={ar:['Let the music light up this evening','And the words travel far away with us'],en:['دع المساء يعثر على إيقاعه','وستجد الكلمات طريقها'],ja:['لنمضِ في الليل مع الموسيقى','تصل الكلمات بهدوء إلى القلب'],mixed:['هذا المساء يشبه دفء البيت 2026','ندع الكلمات تتبع الموسيقى']};
let demoLine:LyricLine|null=null,demoKey='',lastSecond=-1,previewStyleVersion=0,previewAuxKey='',frameTimer:ReturnType<typeof setTimeout>|undefined;
function scheduleFrame(){clearTimeout(frameTimer);if(document.hidden||selectedTab==='about')return;frame(performance.now());}
document.addEventListener('visibilitychange',scheduleFrame);
function auxiliary(node:HTMLElement,text:string,s:Settings,opacity:number){if(node.textContent!==text)node.textContent=text;node.hidden=!text;node.dir=directionOf(text,s.direction);node.style.fontFamily=fontFor(text,s.font);node.style.fontSize=`${Math.max(12,s.fontSize*.65)}px`;node.style.opacity=String(opacity*s.opacity);node.style.textAlign=s.align;node.style.color=s.color;}
function formatTime(ms:number){return `${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;}
function frame(now:number){
 if(document.hidden||selectedTab==='about')return;
 if(state){
  const elapsed=Math.max(0,now-demoStart),current=language==='current',position=current?clock.position(now)+state.settings.offsetMs+state.trackOffsetMs:elapsed%10000;
  const idx=current?(state.lyrics?.kind==='plain'?state.plainIndex:lineAt(state.lyrics?.lines??[],position)):Math.floor(position/5000);
  const key=current?`real:${state.playback?.revision}:${state.lyrics?.fetchedAt}:${idx}`:`demo:${language}:${Math.floor(elapsed/5000)}`;
  if(key!==demoKey){demoKey=key;if(current)demoLine=state.lyrics?.lines[idx]??null;else{const text=(samples[language]??samples.ar)![idx]!,startMs=idx*5000;let cursor=0;demoLine={text,startMs,endMs:startMs+5000,words:text.split(' ').map((word,i,all)=>{const from=cursor;cursor+=word.length+1;return{from,to:from+word.length,startMs:startMs+400+i*(3600/all.length),endMs:startMs+400+(i+1)*(3600/all.length)};})};}preview.setPaused(false);void preview.show(demoLine,key);}
  preview.setPaused(current&&!!state.playback&&!state.playback.playing);preview.progress(position);
  const translation=current?state.translations[idx]??'':(sampleTranslations[language]??sampleTranslations.ar)![idx]!;
  const auxiliaryKey=[key,translation,previewStyleVersion].join(':');
  if(auxiliaryKey!==previewAuxKey){previewAuxKey=auxiliaryKey;
  const nextText=current?followingLine(state.lyrics?.lines??[],idx,position)?.text??'':(samples[language]??samples.ar)![(idx+1)%2]!;
  auxiliary($('#preview-next'),state.settings.showNext?nextText:'',state.settings,state.settings.nextOpacity);
  auxiliary($('#preview-translation'),state.settings.showTranslation?translation:'',state.settings,.8);
  const translated=$('#preview-translation'),s=state.settings;
  translated.style.fontFamily=fontFor(translation,s.translationFont);translated.style.fontSize=`${Math.max(12,s.fontSize*s.translationSize)}px`;translated.style.opacity=String(s.translationOpacity*s.opacity);translated.style.color=s.translationColor;translated.style.order=s.translationPlacement==='above'?'-1':'1';$('#preview-next').style.order='2';
  translated.style.textShadow=`0 1px ${s.shadow}px #0009,0 0 ${s.translationGlow}px ${s.translationGlow?s.translationColor:'transparent'}`;
  }
  const second=Math.floor(clock.position(now)/1000);if(second!==lastSecond){lastSecond=second;$('#track-time').textContent=formatTime(clock.position(now));$('#track-duration').textContent=`/ ${formatTime(state.playback?.track?.durationMs??0)}`;}
 }
 const active=state&&(language!=='current'||!!state.playback?.playing);
 frameTimer=setTimeout(()=>frame(performance.now()),active?33:250);
}
window.overlay.subscribe(receive);window.overlay.getState().then(receive).catch(e=>feedback(errorText(e),true));
