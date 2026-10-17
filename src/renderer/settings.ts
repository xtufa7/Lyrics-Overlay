import './shared.css';
import './settings.css';
import {LyricView} from './lyric-view';
import {PlaybackClock,lineAt,followingLine,directionOf,fontFor} from '../shared/timing';
import {defaults,type Settings,type AppState,type LyricLine,type OverlayAPI} from '../shared/model';
import {developer} from '../shared/developer';

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
let state:AppState,lastSeq=-1,lastRevision='',language='ar',previewManual=false,demoStart=performance.now(),plainKey='',selectedTab='home',feedbackTimer:ReturnType<typeof setTimeout>|undefined;
const timers=new Map<string,ReturnType<typeof setTimeout>>();
const languages:[string,string][]=[['ar','العربية'],['en','English'],['fa','فارسی'],['ur','اردو'],['he','עברית'],['ja','日本語'],['ko','한국어'],['zh','中文'],['fr','Français'],['es','Español'],['de','Deutsch'],['tr','Türkçe']];
type Spec={key:keyof Settings;label:string;type:'range'|'select'|'number'|'color'|'checkbox'|'text'|'shortcut';min?:number;max?:number;step?:number;unit?:string;options?:[string,string][]};
const specs:Record<string,Spec[]>={
 typography:[{key:'font',label:'الخط',type:'select',options:[['auto','تلقائي حسب اللغة'],['Cairo','Cairo · العربية'],['Inter','Inter'],['Noto Sans JP','Noto Sans JP · 日本語'],['Segoe UI','Segoe UI']]},{key:'fontWeight',label:'سماكة الخط',type:'select',options:[['400','عادي'],['500','متوسط'],['600','عريض قليلًا'],['700','عريض']]},{key:'fontSize',label:'حجم الكلمات',type:'range',min:12,max:80,step:1,unit:'px'},{key:'lines',label:'الأسطر الطويلة',type:'select',options:[['one','سطر واحد'],['two','التفاف على سطرين']]},{key:'color',label:'لون النص',type:'color'},{key:'highlight',label:'لون تظليل الكلمات',type:'color'}],
 surface:[{key:'opacity',label:'وضوح النص',type:'range',min:.1,max:1,step:.05},{key:'shadow',label:'ظل خفيف للقراءة',type:'range',min:0,max:20,step:1,unit:'px'},{key:'glow',label:'التوهج',type:'range',min:0,max:30,step:1,unit:'px'},{key:'nextOpacity',label:'وضوح السطر التالي',type:'range',min:.1,max:.8,step:.05}],
 motion:[{key:'entranceMs',label:'مدة ظهور السطر',type:'range',min:0,max:2000,step:20,unit:'ms'},{key:'exitMs',label:'مدة اختفاء السطر',type:'range',min:0,max:1000,step:20,unit:'ms'},{key:'holdMs',label:'تأخير استبدال السطر',type:'range',min:0,max:1000,step:20,unit:'ms'},{key:'reducedMotion',label:'حركة أقل',type:'checkbox'}],
 language:[{key:'direction',label:'اتجاه الكلمات',type:'select',options:[['auto','تلقائي لكل سطر'],['rtl','من اليمين لليسار'],['ltr','من اليسار لليمين']]},{key:'showNext',label:'إظهار الجملة التالية',type:'checkbox'}],
 placement:[{key:'width',label:'عرض مساحة الكلمات',type:'number',min:240,max:2400,step:10,unit:'px'},{key:'height',label:'ارتفاع مساحة الكلمات',type:'number',min:40,max:600,step:5,unit:'px'},{key:'align',label:'محاذاة النص',type:'select',options:[['center','الوسط'],['right','اليمين'],['left','اليسار']]},{key:'vertical',label:'محاذاة المساحة رأسيًا',type:'select',options:[['center','الوسط'],['top','الأعلى'],['bottom','الأسفل']]},{key:'monitor',label:'الشاشة',type:'select',options:[['primary','الشاشة الرئيسية']]},{key:'x',label:'الموضع الأفقي X',type:'number',min:-50000,max:50000,step:1,unit:'px'},{key:'y',label:'الموضع الرأسي Y',type:'number',min:-50000,max:50000,step:1,unit:'px'}],
 shortcut:[{key:'visibilityShortcut',label:'إظهار / إخفاء الكلمات',type:'shortcut'},{key:'positionShortcut',label:'إظهار في الموضع المحفوظ',type:'shortcut'},{key:'editShortcut',label:'تحريك وتغيير الحجم',type:'shortcut'},{key:'autoStart',label:'التشغيل مع Windows',type:'checkbox'}],
 translation:[{key:'translationTarget',label:'الترجمة إلى',type:'select',options:languages},{key:'translationSource',label:'لغة النص الأصلي',type:'select',options:[['auto','تلقائي'],...languages]},{key:'translationModel',label:'نموذج الذكاء الاصطناعي',type:'text'},{key:'showTranslation',label:'إظهار الترجمة تحت الكلمات',type:'checkbox'}],
 ollama:[{key:'ollamaUrl',label:'خادم Ollama المحلي',type:'text'}],
 lyrics:[{key:'onlineLyrics',label:'البحث عبر LRCLIB',type:'checkbox'},{key:'offsetMs',label:'الإزاحة العامة للكلمات',type:'number',min:-30000,max:30000,step:50,unit:'ms'}]
};
function prettyShortcut(value:string){return value.replace(/Control/g,'Ctrl').replace(/\+/g,' + ');}
function feedback(text:string,error=false){const el=$('#feedback');el.textContent=text;el.hidden=!text;el.classList.toggle('error',error);clearTimeout(feedbackTimer);if(!error)feedbackTimer=setTimeout(()=>{el.hidden=true;},8000);}
function errorText(e:unknown){return String(e).replace(/^Error: Error invoking remote method '[^']+': Error: /,'').replace(/^Error: /,'');}
async function save(patch:Partial<Settings>){$('#save-status').textContent='جارٍ الحفظ…';try{await window.overlay.updateSettings(patch);$('#save-status').textContent='حُفظت تعديلاتك على جهازك';}catch(e){feedback(errorText(e),true);$('#save-status').textContent='تعذّر الحفظ';}}
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
   input.readOnly=true;input.title='انقر ثم اضغط اختصارًا يتضمن Ctrl أو Alt أو Shift';
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
    if(state){state.settings={...state.settings,[spec.key]:value};preview.configure(state.settings);sizePreview();}
    clearTimeout(timers.get(spec.key));timers.set(spec.key,setTimeout(()=>void save({[spec.key]:value}),event==='input'?100:0));
   });
  }
  field.append(label,input);host.append(field);
 }
}
for(const [id,name,description] of [['slide','move','انسياب'],['fade','fade','تلاشي سينمائي'],['karaoke','wave','كاريوكي'],['minimal','minimal','هادئ'],['dynamic','dynamic','حيوي']] as const){
 const b=document.createElement('button');b.className='preset';b.dataset.preset=id;b.innerHTML=icon(name);const label=document.createElement('span');label.textContent=description;b.append(label);b.onclick=()=>void save({preset:id});$('#presets').append(b);
}
for(const [id,name,caption] of [['gemini','Gemini','ذكاء اصطناعي · سياق السطور'],['ollama','Ollama','ذكاء اصطناعي · على جهازك'],['mymemory','MyMemory','أساسي · بدون مفتاح']] as const){
 const b=document.createElement('button');b.className='provider';b.dataset.provider=id;const title=document.createElement('strong');title.textContent=name;title.dir='ltr';const desc=document.createElement('span');desc.textContent=caption;b.append(title,desc);b.onclick=()=>void save({translationProvider:id,...id==='gemini'?{translationModel:'gemini-3.8-flash'}:id==='ollama'?{translationModel:'qwen3:8b'}:{}});$('#providers').append(b);
}
const titles:Record<string,[string,string]>={home:['الكلمات، على طريقتك.','فوق تطبيقاتك. بلا إطار. وفي اللحظة المناسبة.'],appearance:['لكل أغنية، إحساسها.','عدّل الشكل وشاهد النتيجة فورًا.'],position:['مساحتك. موضعك. اختصارك.','ضع الكلمات حيث تناسبك، وأعدها باختصار واحد.'],translation:['افهم ما وراء الكلمات.','ترجمة تظهر في توقيت السطر الأصلي.'],lyrics:['كل سطر في وقته.','مصادر الكلمات، الملفات المحلية، وضبط التزامن.'],about:['صُنع بشغف، بواسطة 0xTuFa7.','الأدوات اليومية تستحق تجربة أفضل.']};
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-tab]'))b.onclick=()=>{
 selectedTab=b.dataset.tab!;for(const el of document.querySelectorAll('[data-tab]'))el.classList.toggle('active',el===b);
 for(const el of document.querySelectorAll('.tab'))el.classList.toggle('active',el.id===`tab-${selectedTab}`);
 $('#page-title').textContent=titles[selectedTab]![0];$('#page-subtitle').textContent=titles[selectedTab]![1];$('.content').scrollTop=0;
};
async function action(name:Parameters<OverlayAPI['action']>[0],option?:string){try{const response=await window.overlay.action(name,option);if(response)feedback(response);return response;}catch(e){feedback(errorText(e),true);return null;}}
for(const [selector,name] of [['#toggle','toggle'],['#edit','edit'],['#save-position','savePosition'],['#restore-position','restorePosition'],['#reset-position','resetPosition'],['#refresh','refresh'],['#clear-import','clearImport'],['#reset-pairing','resetPairing'],['#translate','translate'],['#cancel-translation','cancelTranslation']] as const)$(selector).onclick=()=>void action(name);
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-place]'))b.onclick=()=>void action('place',b.dataset.place);
$('#import').onclick=()=>void action('import',$<HTMLInputElement>('#ttml-absolute').checked?'absolute':'relative');
$('#pair').onclick=async()=>{const code=await action('pair');if(code){$('#pair-code').textContent=code;feedback('أدخل الرمز في زر Lyrics Overlay داخل Spotify خلال خمس دقائق.');}};
$('#install').onclick=()=>void action('install');
$('#repository').onclick=()=>void action('openLink','repository');$('#get-key').onclick=()=>void action('openLink','geminiKey');
$('#save-key').onclick=async()=>{const input=$<HTMLInputElement>('#translation-key');try{await window.overlay.setTranslationKey(input.value);input.value='';feedback('حُفظ المفتاح مشفّرًا باستخدام Windows.');}catch(e){feedback(errorText(e),true);}};
$('#clear-key').onclick=async()=>{try{await window.overlay.setTranslationKey('');$<HTMLInputElement>('#translation-key').value='';feedback('حُذف المفتاح المحفوظ.');}catch(e){feedback(errorText(e),true);}};
$('#track-offset').addEventListener('change',async()=>{try{await window.overlay.setTrackOffset($<HTMLInputElement>('#track-offset').valueAsNumber);}catch(e){feedback(errorText(e),true);}});
$('#preview-language').addEventListener('change',()=>{previewManual=true;language=$<HTMLSelectElement>('#preview-language').value;demoStart=performance.now();});
for(const [key,name,symbol] of [['website','موقعي','globe'],['github','GitHub','github'],['x','X / 0xtufa7','x'],['instagram','Instagram','instagram'],['email','البريد','mail'],['releases','تحميل من GitHub','arrow']] as const){
 const b=document.createElement('button');b.dataset.developerLink=key;b.innerHTML=icon(symbol);const span=document.createElement('span');span.textContent=name;b.append(span);b.onclick=()=>void action('openLink',key);$('#developer-links').append(b);
}
window.overlay.displays().then(displays=>{const select=$<HTMLSelectElement>('#setting-monitor');for(const d of displays)select.append(new Option(d.label,d.id));}).catch(()=>{});
function sizePreview(){const s=state?.settings??defaults,stage=$('#preview-stage'),space=$('#preview-space');stage.style.width=`${s.width}px`;stage.style.height=`${s.height}px`;stage.style.transform=`scale(${Math.min(1,(space.clientWidth-30)/s.width,138/s.height)})`;$('#dimensions').textContent=`${s.width} × ${s.height}`;}
new ResizeObserver(sizePreview).observe($('#preview-space'));
function receive(next:AppState){
 const oldSettings=state?.settings;state=next;
 if(!previewManual){language=next.connected?'current':'ar';$<HTMLSelectElement>('#preview-language').value=language;}
 if(next.playback?.seq!==lastSeq||next.playback?.revision!==lastRevision){clock.update(next.playback,performance.now());lastSeq=next.playback?.seq??-1;lastRevision=next.playback?.revision??'';}
 for(const [key,value] of Object.entries(next.settings)){
  const el=document.querySelector<HTMLInputElement|HTMLSelectElement>(`[data-setting="${key}"]`);if(!el||document.activeElement===el)continue;
  if(el instanceof HTMLInputElement&&el.type==='checkbox')el.checked=!!value;else el.value=value===null?'':key.endsWith('Shortcut')?prettyShortcut(String(value)):String(value);
  const spec=Object.values(specs).flat().find(s=>s.key===key),out=el.parentElement?.querySelector('.unit');if(out&&spec)out.textContent=spec.type==='range'?`${value}${spec.unit?' '+spec.unit:''}`:spec.unit??'';
 }
 for(const el of document.querySelectorAll<HTMLElement>('[data-preset]')){const selected=el.dataset.preset===next.settings.preset;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));}
 for(const el of document.querySelectorAll<HTMLElement>('[data-provider]')){const selected=el.dataset.provider===next.settings.translationProvider;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));}
 $('#toggle span')!.textContent=next.settings.visible?'إخفاء الكلمات':'إظهار الكلمات';$('#toggle').classList.toggle('off',!next.settings.visible);$('#toggle').setAttribute('aria-pressed',String(next.settings.visible));
 $('#edit span')!.textContent=next.edit?'إنهاء تحريك الكلمات':'تحريك وتغيير الحجم';
 $('#connection-label').classList.toggle('online',next.connected);$('#connection-text').textContent=next.connected?'Spotify متصل':'Spotify غير متصل';
 $('#connection-badge').textContent=next.connected?'متصل':'غير متصل';$('#connection-badge').classList.toggle('online',next.connected);
 $('#setup-heading').textContent=next.connected?'الموسيقى وصلت.':next.connectionPhase==='installing'?'نجّهز الاتصال…':'لنربط الموسيقى بالكلمات.';
 $('#setup-status').textContent=next.setupStatus;
 $<HTMLButtonElement>('#install').disabled=next.connectionPhase==='installing';$('#install span')!.textContent=next.connectionPhase==='installing'?'جارٍ الربط…':next.connected?'إصلاح / تحديث الربط':'ربط Spotify';
 $('#position-key').textContent=prettyShortcut(next.settings.positionShortcut);
 const saved=next.settings.savedPosition;$('#saved-place-note').textContent=saved?`الموضع المحفوظ: X ${saved.x} · Y ${saved.y} · ${saved.width} × ${saved.height}`:'لم يُحفظ موضع مخصص بعد. استخدم «حفظ هذا الموضع» من الرئيسية.';
 for(const el of document.querySelectorAll('[data-track-title]'))el.textContent=next.playback?.track?.title??'لا توجد أغنية متصلة';
 for(const el of document.querySelectorAll('[data-track-artist]'))el.textContent=next.playback?.track?`${next.playback.track.artist} · ${next.playback.track.album}`:'اربط Spotify ثم شغّل أغنية.';
 for(const el of document.querySelectorAll('[data-lyrics-status]'))el.textContent=next.status;
 $('#playback-state').textContent=next.playback?.playing?'تعمل الآن':next.playback?.track?'متوقفة مؤقتًا':'بانتظار الموسيقى';
 if(document.activeElement!==$('#track-offset'))$<HTMLInputElement>('#track-offset').value=String(next.trackOffsetMs);
 $('#warnings').hidden=!next.warnings.length;$('#warnings').textContent=next.warnings.join('\n');
 $('#key-status').textContent=next.translationKeySet?'محفوظ مشفّرًا · لا يظهر مجددًا':'لم يُضف بعد';
 $('#translation-status').textContent=next.translationStatus;
 const provider=next.settings.translationProvider;$('#gemini-secret').hidden=provider!=='gemini';$('#ollama-fields').hidden=provider!=='ollama';
 $('[data-field="translationModel"]').hidden=provider==='mymemory';
 $('#provider-note').textContent=provider==='gemini'?'اختر النموذج المتاح في حسابك. يتطلب مفتاحك الخاص وتطبّق حدود وفوترة مزوّدك.':provider==='ollama'?'شغّل Ollama وثبّت النموذج الذي تكتبه هنا. العنوان محلي فقط ولا يحتاج مفتاح API.':'ترجمة أساسية محدودة الاستخدام، بلا مفتاح. اختر لغة الأصل يدويًا إن كان الاكتشاف غير صحيح؛ للمعنى الأدق استخدم مزوّد AI.';
 $<HTMLButtonElement>('#translate').disabled=!next.lyrics?.lines.length;
 $('#plain-section').hidden=next.lyrics?.kind!=='plain';const pk=next.lyrics?.kind==='plain'?`${next.lyrics.fetchedAt}:${next.plainIndex}`:'';
 if(pk!==plainKey){plainKey=pk;$('#plain-lines').replaceChildren();if(next.lyrics?.kind==='plain')next.lyrics.lines.forEach((line,i)=>{const b=document.createElement('button');b.textContent=line.text;b.dir='auto';b.classList.toggle('selected',i===next.plainIndex);b.onclick=()=>void action('selectPlain',String(i));$('#plain-lines').append(b);});}
 if(!oldSettings||JSON.stringify(oldSettings)!==JSON.stringify(next.settings)){preview.configure(next.settings);sizePreview();}
}
const samples:Record<string,string[]>={ar:['دع الموسيقى تضيء هذا المساء','وتسافر الكلمات معنا إلى البعيد'],en:['Let the evening find its rhythm','And the words will find their way'],ja:['音楽とともに 夜を歩こう','言葉は静かに 心へ届く'],mixed:['هذا المساء feels like home 2026','نترك الكلمات follow the music']};
const sampleTranslations:Record<string,string[]>={ar:['Let the music light up this evening','And the words travel far away with us'],en:['دع المساء يعثر على إيقاعه','وستجد الكلمات طريقها'],ja:['لنمضِ في الليل مع الموسيقى','تصل الكلمات بهدوء إلى القلب'],mixed:['هذا المساء يشبه دفء البيت 2026','ندع الكلمات تتبع الموسيقى']};
let demoLine:LyricLine|null=null,demoKey='',lastSecond=-1;
function auxiliary(node:HTMLElement,text:string,s:Settings,opacity:number){if(node.textContent!==text)node.textContent=text;node.hidden=!text;node.dir=directionOf(text,s.direction);node.style.fontFamily=fontFor(text,s.font);node.style.fontSize=`${Math.max(12,s.fontSize*.65)}px`;node.style.opacity=String(opacity*s.opacity);node.style.textAlign=s.align;node.style.color=s.color;}
function formatTime(ms:number){return `${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;}
function frame(now:number){
 if(state){
  const elapsed=Math.max(0,now-demoStart),current=language==='current',position=current?clock.position(now)+state.settings.offsetMs+state.trackOffsetMs:elapsed%10000;
  const idx=current?(state.lyrics?.kind==='plain'?state.plainIndex:lineAt(state.lyrics?.lines??[],position)):Math.floor(position/5000);
  const key=current?`real:${state.playback?.revision}:${state.lyrics?.fetchedAt}:${idx}`:`demo:${language}:${Math.floor(elapsed/5000)}`;
  if(key!==demoKey){demoKey=key;if(current)demoLine=state.lyrics?.lines[idx]??null;else{const text=(samples[language]??samples.ar)![idx]!,startMs=idx*5000;let cursor=0;demoLine={text,startMs,endMs:startMs+5000,words:text.split(' ').map((word,i,all)=>{const from=cursor;cursor+=word.length+1;return{from,to:from+word.length,startMs:startMs+400+i*(3600/all.length),endMs:startMs+400+(i+1)*(3600/all.length)};})};}preview.setPaused(false);void preview.show(demoLine,key);}
  preview.setPaused(current&&!!state.playback&&!state.playback.playing);preview.progress(position);
  const nextText=current?followingLine(state.lyrics?.lines??[],idx,position)?.text??'':(samples[language]??samples.ar)![(idx+1)%2]!;
  auxiliary($('#preview-next'),state.settings.showNext?nextText:'',state.settings,state.settings.nextOpacity);
  const translation=current?state.translations[idx]??'':(sampleTranslations[language]??sampleTranslations.ar)![idx]!;
  auxiliary($('#preview-translation'),state.settings.showTranslation?translation:'',state.settings,.8);
  const second=Math.floor(clock.position(now)/1000);if(second!==lastSecond){lastSecond=second;$('#track-time').textContent=formatTime(clock.position(now));$('#track-duration').textContent=`/ ${formatTime(state.playback?.track?.durationMs??0)}`;}
 }
 requestAnimationFrame(frame);
}
window.overlay.subscribe(receive);window.overlay.getState().then(receive).catch(e=>feedback(errorText(e),true));requestAnimationFrame(frame);
