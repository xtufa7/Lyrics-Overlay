import { directionOf, fontFor,visualWords } from '../shared/timing';
import type { LyricLine, Settings } from '../shared/model';

export class LyricView {
  private block=document.createElement('div');
  private base=document.createElement('div');
  private mask=document.createElement('div');
  private underline=document.createElement('div');
  private key='';private generation=0;private line:LyricLine|null=null;
  private settings!:Settings;private animations:Animation[]=[];private paused=false;
  private ranges:{left:number;top:number;width:number;height:number;start:number;end:number;rtl:boolean}[]=[];
  private lastMask='';
  private lastUnderline='';
  private position=0;
  constructor(private host:HTMLElement) {
    this.block.className='lyric-block';this.base.className='lyric-text';this.mask.className='lyric-highlight';
    this.mask.setAttribute('aria-hidden','true');this.block.append(this.base,this.mask);host.append(this.block);
    this.underline.className='word-underline';this.underline.setAttribute('aria-hidden','true');this.block.append(this.underline);
    new ResizeObserver(()=>this.measure()).observe(this.host);
    document.fonts.ready.then(()=>this.measure());
  }
  configure(s:Settings) {
    this.settings=s;s={...s,border:false,glass:false};
    this.host.style.cssText=`color:${s.color};opacity:${s.opacity};font-size:${s.fontSize}px;font-weight:${s.fontWeight};text-align:${s.align};border:${s.border?s.borderWidth:0}px solid ${s.color};border-radius:${s.radius}px;background:${s.glass?'rgba(18,23,22,.58)':'transparent'};backdrop-filter:${s.glass?'blur(16px)':'none'};justify-content:${{top:'flex-start',center:'center',bottom:'flex-end'}[s.vertical]};text-shadow:0 1px ${s.shadow}px rgba(0,0,0,.65),0 0 ${s.glow}px ${s.glow?s.color:'transparent'};`;
    this.host.classList.toggle('two-lines',s.lines==='two');
    this.mask.style.color=s.highlight;this.underline.style.backgroundColor=s.highlight;this.block.classList.toggle('reduced-motion',s.reducedMotion);this.applyTextStyle();
    this.measure();requestAnimationFrame(()=>this.measure());
  }
  private applyTextStyle() {
    const text=this.line?.text??'',s=this.settings;
    if(!s)return;
    this.block.dir=directionOf(text,s.direction);this.block.style.fontFamily=fontFor(text,s.font);
  }
  setPaused(paused:boolean) {if(this.paused===paused)return;this.paused=paused;for(const a of this.animations)paused?a.pause():a.play();}
  replay(){this.key='';}
  private async animate(frames:Keyframe[],duration:number,delay=0) {
    if(duration===0&&delay===0)return;
    const a=this.block.animate(frames,{duration,delay,easing:'cubic-bezier(.22,.8,.25,1)',fill:'both'});
    this.animations.push(a);if(this.paused)a.pause();
    try {await a.finished;}catch{}
    this.animations=this.animations.filter(item=>item!==a);a.cancel();
  }
  async show(line:LyricLine|null,key:string,immediate=false) {
    if(key===this.key)return;
    // A newly loaded or sought cue must appear even while playback is paused; don't await a paused exit.
    immediate=immediate||this.paused;
    this.key=key;const gen=++this.generation;
    for(const a of this.animations)a.cancel();this.animations=[];
    const s=this.settings,reduced=s.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(this.base.textContent&&!immediate&&!reduced)await this.animate([{opacity:1},{opacity:0,filter:s.preset==='minimal'?'none':'blur(2px)'}],s.preset==='minimal'?Math.min(80,s.exitMs):s.exitMs,s.holdMs);
    if(gen!==this.generation)return;
    this.line=line;const text=s.lines==='one'?(line?.text??'').replace(/\n/g,' '):(line?.text??'');
    this.base.textContent=text;this.mask.textContent=text;this.mask.style.clipPath='inset(0 100% 0 0)';this.lastMask='';
    this.applyTextStyle();this.measure();
    if(!text||immediate||reduced)return;
    const sign=directionOf(text,s.direction)==='rtl'?1:-1;
    const frames:Record<string,Keyframe[]>={
      slide:[{opacity:0,transform:`translateX(${sign*14}px)`,filter:'blur(3px)'},{opacity:1,transform:'translateX(0)',filter:'blur(0)'}],
      fade:[{opacity:0,filter:'blur(5px)'},{opacity:1,filter:'blur(0)'}],
      karaoke:[{opacity:0,transform:`translateX(${sign*6}px)`},{opacity:1,transform:'translateX(0)'}],
      minimal:[{opacity:.5},{opacity:1}],
      dynamic:[{opacity:0,transform:`translateX(${sign*10}px) scale(.97)`,filter:'blur(2px)'},{opacity:1,transform:'translateX(0) scale(1)',filter:'blur(0)'}]
    };
    await this.animate(frames[s.preset]!,s.preset==='minimal'?Math.min(90,s.entranceMs):s.entranceMs);
  }
  private measure() {
    this.ranges=[];
    if(!this.line||!this.base.firstChild){this.progress(this.position);return;}
    const rect=this.base.getBoundingClientRect(),node=this.base.firstChild;
    const text=node.textContent??'';
    // A Range measures the shaped full text. The duplicate highlight text is never split into glyph spans.
    for(const word of visualWords(this.line,this.settings.wordTiming==='estimate')) {
      if(word.from<0||word.to>text.length||word.to<=word.from)continue;
      const range=document.createRange();range.setStart(node,word.from);range.setEnd(node,word.to);
      for(const r of range.getClientRects())this.ranges.push({left:r.left-rect.left,top:r.top-rect.top,width:r.width,height:r.height,start:word.startMs,end:word.endMs,rtl:directionOf(text.slice(word.from,word.to),this.settings.direction)==='rtl'});
    }
    this.progress(this.position);
  }
  progress(position:number) {
    this.position=position;if(!this.settings)return;
    if(this.settings.wordHighlight==='off'||!this.ranges.length){this.mask.style.visibility='hidden';this.underline.hidden=true;return;}
    this.mask.style.visibility='visible';
    // One compound SVG path clips a full shaped duplicate. Each word progresses in its own strong direction.
    let path='';
    let active:typeof this.ranges[number]|undefined;
    for(const r of this.ranges) {
      if(position>=r.start&&position<r.end)active=r;
      const f=Math.max(0,Math.min(1,(position-r.start)/Math.max(1,r.end-r.start)));
      if(f===0)continue;
      if(this.settings.wordHighlight==='word'&&(position<r.start||position>=r.end))continue;
      const width=r.width*(this.settings.wordHighlight==='word'?1:f),left=r.left+(r.rtl?r.width-width:0);
      path+=`M${left.toFixed(2)} ${r.top.toFixed(2)}h${width.toFixed(2)}v${r.height.toFixed(2)}h-${width.toFixed(2)}Z`;
    }
    if(path!==this.lastMask){this.lastMask=path;this.mask.style.clipPath=path?`path('${path}')`:'inset(0 100% 0 0)';}
    this.underline.hidden=!active||!this.settings.wordUnderline;
    const underlineKey=active?[active.left,active.top,active.width,active.height].join(':'):'';
    if(active&&underlineKey!==this.lastUnderline){
      this.lastUnderline=underlineKey;
      this.underline.style.transform=`translate(${active.left.toFixed(2)}px,${(active.top+active.height-3).toFixed(2)}px)`;
      this.underline.style.width=`${active.width.toFixed(2)}px`;
    }
  }
}
