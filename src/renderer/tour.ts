type Step={tab:string;target:string;title:string;text:string};
const steps:Step[]=[
 {tab:'home',target:'#install',title:'Connect Spotify',text:'This installs the local extension. Once connected, start any song in Spotify.'},
 {tab:'appearance',target:'#themes button',title:'Make it yours',text:'Choose a theme, then tune text colors, size and glow. Lyrics stay transparent.'},
 {tab:'appearance',target:'[data-field="wordHighlight"]',title:'Follow each word',text:'Color the current word and follow the moving underline. Estimates are available for songs with line timing only.'},
 {tab:'translation',target:'#setting-translationTarget',title:'Choose a translation',text:'Automatic switches Arabic to English and English to Arabic. Or choose any supported language. Translate song starts the request.'},
 {tab:'translation',target:'#quick-translation',title:'Show it only when you want',text:'Switch translation on or off instantly here. Its color, font and glow have separate controls.'},
 {tab:'home',target:'#save-position',title:'Your spot, one shortcut',text:'Move the overlay, save its position, then use your position shortcut to show it there.'}
];
let cleanup:(()=>void)|undefined;
export function startTour(){
 cleanup?.();let index=0,previous=document.activeElement as HTMLElement|null;
 const layer=document.createElement('div');layer.className='tour-layer';
 const focus=document.createElement('div');focus.className='tour-focus';
 const card=document.createElement('section');card.className='tour-card';card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-labelledby','tour-title');
 card.innerHTML='<span id="tour-step"></span><h2 id="tour-title"></h2><p id="tour-description"></p><div><button class="text-button" id="tour-skip">Skip tour</button><button class="secondary" id="tour-back">Back</button><button class="primary" id="tour-next">Next</button></div>';
 layer.append(focus,card);document.body.append(layer);
 const at=<T extends HTMLElement>(s:string)=>card.querySelector<T>(s)!;
 const finish=()=>{cleanup?.();void window.overlay.updateSettings({tourComplete:true}).catch(()=>{});};
 const place=()=>{
  const target=document.querySelector<HTMLElement>(steps[index]!.target);if(!target)return;
  const r=target.getBoundingClientRect(),radius=Math.min(190,Math.max(42,Math.hypot(r.width,r.height)/2+13));
  const cx=r.left+r.width/2,cy=r.top+r.height/2;
  focus.style.cssText=`width:${radius*2}px;height:${radius*2}px;left:${cx-radius}px;top:${cy-radius}px`;
  const left=Math.max(18,Math.min(innerWidth-338,cx-155));
  const below=cy+radius+20,top=below+card.offsetHeight<innerHeight-18?below:Math.max(18,cy-radius-card.offsetHeight-20);
  card.style.left=`${left}px`;card.style.top=`${top}px`;
 };
 const show=()=>{
  const s=steps[index]!;document.querySelector<HTMLButtonElement>(`[data-tab="${s.tab}"]`)?.click();
  at('#tour-step').textContent=`QUICK TOUR · ${index+1} / ${steps.length}`;at('#tour-title').textContent=s.title;at('#tour-description').textContent=s.text;
  at<HTMLButtonElement>('#tour-back').disabled=index===0;at('#tour-next').textContent=index===steps.length-1?'Done':'Next';
  document.querySelector<HTMLElement>(s.target)?.scrollIntoView({block:'center',behavior:'instant'});
  requestAnimationFrame(()=>{place();at('#tour-next').focus();});
 };
 at('#tour-skip').onclick=finish;at('#tour-back').onclick=()=>{index=Math.max(0,index-1);show();};
 at('#tour-next').onclick=()=>{if(++index===steps.length){finish();return;}show();};
 const key=(e:KeyboardEvent)=>{
  if(e.key==='Escape'){e.preventDefault();finish();}
  if(e.key==='Tab'){
   const controls=[...card.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],first=controls[0],last=controls.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  }
 };
 document.addEventListener('keydown',key,true);window.addEventListener('resize',place);document.querySelector('.content')?.addEventListener('scroll',place);
 cleanup=()=>{document.removeEventListener('keydown',key,true);window.removeEventListener('resize',place);document.querySelector('.content')?.removeEventListener('scroll',place);layer.remove();previous?.focus();cleanup=undefined;};
 show();
}
