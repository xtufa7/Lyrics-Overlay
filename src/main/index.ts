import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, globalShortcut, dialog, safeStorage, shell, type IpcMainInvokeEvent } from 'electron';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { SettingsStore, LyricsStore, readJson, atomicJson, trackKey } from './store';
import { LocalBridge } from './bridge';
import { LrclibProvider } from '../lyrics/provider';
import { parseLrc, parseTtml, plainLyrics } from '../lyrics/parsers';
import { PORT, settingsSchema, type AppState, type Playback, type Settings } from '../shared/model';
import {TranslationEngine,localOllamaUrl} from '../lyrics/translation';
import {developer} from '../shared/developer';

const run = promisify(execFile);
const smoke = process.env.LYRICS_OVERLAY_TEST === '1';
if (smoke && process.env.LYRICS_OVERLAY_DATA) app.setPath('userData',resolve(process.env.LYRICS_OVERLAY_DATA));
app.setName('Spicetify Lyrics Overlay');
const gotLock=app.requestSingleInstanceLock();
if (!gotLock||process.argv.includes('--quit')) app.quit();
else {
  app.on('second-instance',(_event,args)=>{if(args.includes('--quit')){app.quit();return;}openSettings();if(state&&args.includes('--connect-spotify'))void installExtension().catch(()=>{});});
  app.on('window-all-closed',()=>{}); // Tray app: closing settings must not close the overlay.
  app.whenReady().then(start).catch(error=>{dialog.showErrorBox('Lyrics Overlay could not start',String(error));app.quit();});
}
let overlay: BrowserWindow | null=null, settingsWindow:BrowserWindow|null=null, tray:Tray|null=null;
let bridge:LocalBridge, store:SettingsStore, lyricsStore:LyricsStore;
let state:AppState;
let lyricRequest:AbortController|null=null, requestGeneration=0, closing=false;
let writeQueue=Promise.resolve(), geometryTimer:ReturnType<typeof setTimeout>|undefined;
let resizeTimer:ReturnType<typeof setInterval>|undefined;
let offsets:Record<string,number>={};
let translator:TranslationEngine,translationKey='',translationRequest:AbortController|null=null,translationGeneration=0;
const root=join(__dirname,'renderer');
const page=(name:string)=>join(root,`${name}.html`);
const url=(name:string)=>pathToFileURL(page(name)).href;
function secureWindow(win:BrowserWindow,name:string) {
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,target)=>{if(target!==url(name))event.preventDefault();});
  win.webContents.session.setPermissionRequestHandler((_web,_permission,callback)=>callback(false));
}
function preferences(role:'overlay'|'settings') {
  return {preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,backgroundThrottling:role!=='overlay',additionalArguments:[`--overlay-role=${role}`]};
}
function broadcast() {
  if (closing || !state) return;
  for(const win of [overlay,settingsWindow])if(win&&!win.isDestroyed()&&!win.webContents.isDestroyed())win.webContents.send('state',state);
  updateTray();
}
function warning(message:string) {if(closing)return;if(!state.warnings.includes(message))state.warnings.push(message);broadcast();}
function shutdown() {
  if(closing)return;
  closing=true;requestGeneration++;translationGeneration++;
  lyricRequest?.abort();translationRequest?.abort();
  globalShortcut.unregisterAll();
  if(resizeTimer)clearInterval(resizeTimer);
  if(geometryTimer)clearTimeout(geometryTimer);
  // Socket close events can arrive after native tray/window disposal.
  const currentTray=tray;tray=null;
  if(currentTray&&!currentTray.isDestroyed())currentTray.destroy();
  void bridge?.stop().catch(error=>console.error('Local bridge shutdown failed:',error));
}
app.on('before-quit',shutdown);
function displayFor(s:Settings) {return screen.getAllDisplays().find(d=>String(d.id)===s.monitor)??screen.getPrimaryDisplay();}
function titleBar(s:Settings){return {color:({midnight:'#1d1d2d',graphite:'#161719',ocean:'#101e2b',forest:'#15221e',light:'#f5f5fa'})[s.theme],symbolColor:s.theme==='light'?'#232738':'#d7d9ed',height:36};}
function geometry(s:Settings) {
  const area=displayFor(s).workArea;
  const width=Math.min(s.width,area.width),height=Math.min(s.height,area.height);
  const x=s.x??Math.round(area.x+(area.width-width)/2),y=s.y??area.y+24;
  // Explicitly keep the entire overlay within its selected monitor, including negative-coordinate monitors.
  return {width,height,x:Math.round(Math.max(area.x,Math.min(area.x+area.width-width,x))),y:Math.round(Math.max(area.y,Math.min(area.y+area.height-height,y)))};
}
async function start() {
  const dir=app.getPath('userData');
  store=new SettingsStore(dir);await store.load();
  const migrated=await readJson(join(dir,'layout-v2.json'),false);
  if(!migrated){await store.save({border:false,glass:false,height:Math.max(116,store.value.height)});await atomicJson(join(dir,'layout-v2.json'),true);}
  const updated=await readJson(join(dir,'layout-v21.json'),false);
  if(!updated){await store.save({translationTarget:'auto'});await atomicJson(join(dir,'layout-v21.json'),true);}
  if(app.isPackaged&&store.value.autoStart)app.setLoginItemSettings({openAtLogin:true,path:process.execPath,args:['--background']});
  offsets=await readJson(join(dir,'offsets.json'),{});
  lyricsStore=new LyricsStore(dir,[new LrclibProvider()]);await lyricsStore.initialize();
  translator=new TranslationEngine(dir);
  const secret=await readJson<{gemini?:string}>(join(dir,'secrets.json'),{});
  if(secret.gemini&&safeStorage.isEncryptionAvailable()){try{translationKey=safeStorage.decryptString(Buffer.from(secret.gemini,'base64'));}catch{translationKey='';}}
  state={settings:store.value,connected:false,playback:null,lyrics:null,status:'Waiting for a song',edit:false,warnings:[],trackOffsetMs:0,plainIndex:0,setupStatus:'Choose Connect Spotify to get started',connectionPhase:'idle',translations:[],translationStatus:'This song has not been translated',translationKeySet:!!translationKey};
  overlay=new BrowserWindow({...geometry(store.value),show:false,transparent:true,frame:false,thickFrame:false,resizable:false,skipTaskbar:true,focusable:false,hasShadow:false,alwaysOnTop:true,backgroundColor:'#00000000',title:'Lyrics Overlay',webPreferences:preferences('overlay')});
  overlay.setAlwaysOnTop(true,'screen-saver');overlay.setIgnoreMouseEvents(true,{forward:true});
  secureWindow(overlay,'overlay');
  overlay.on('close',event=>{if(!closing){event.preventDefault();void patchSettings({visible:false});}});
  overlay.on('moved',()=>saveGeometry());
  overlay.on('closed',()=>{overlay=null;});
  overlay.webContents.on('did-finish-load',()=>{if(!closing&&state.settings.visible)overlay?.showInactive();broadcast();});
  installIpc();
  const trayImage=nativeImage.createFromPath(join(__dirname,'assets/tray.png'));
  tray=new Tray(trayImage);tray.setToolTip('Spicetify Lyrics Overlay');tray.on('double-click',()=>openSettings());updateTray();
  await registerShortcuts();
  const refreshDisplay=()=>{if(closing||!overlay||overlay.isDestroyed())return;overlay.setBounds(geometry(state.settings));broadcast();};
  screen.on('display-removed',refreshDisplay);
  screen.on('display-metrics-changed',refreshDisplay);
  bridge=new LocalBridge(dir,{
    playback:receivePlayback,
    connected:connected=>{
      if(closing)return;
      state.connected=connected;
      if(!connected){lyricRequest?.abort();translationRequest?.abort();translationGeneration++;requestGeneration++;state.playback=null;state.lyrics=null;state.translations=[];state.status='Spotify disconnected';if(state.connectionPhase!=='installing')state.connectionPhase='waiting';state.setupStatus='Waiting for Spotify. Open it or choose Repair connection.';}
      else{state.status='Connected; waiting for playback';state.connectionPhase='connected';state.setupStatus='Connected securely on this device';}
      broadcast();
    },
    command:action=>{if(action==='toggle')void patchSettings({visible:!state.settings.visible});else openSettings();},
    error:warning
  },smoke?43828:PORT);
  try {await bridge.start();} catch {state.connectionPhase='error';state.setupStatus='Local port 43827 is busy. Close other copies of Lyrics Overlay and restart.';warning(state.setupStatus);}
  await overlay.loadFile(page('overlay'));
  if(process.argv.includes('--settings')||!process.argv.includes('--background'))openSettings();
  await atomicJson(join(dir,'onboarded.json'),true);
  if(process.argv.includes('--connect-spotify'))void installExtension().catch(()=>{});
}
function updateTray() {
  if(closing||!tray||tray.isDestroyed()||!state)return;
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:state.connected?'Spotify connected':'Waiting for Spotify',enabled:false},
    {type:'separator'},
    {label:'Show lyrics',type:'checkbox',checked:state.settings.visible,click:()=>void patchSettings({visible:!state.settings.visible})},
    {label:'Show at saved position',click:()=>void restorePosition()},
    {label:'Move & resize',type:'checkbox',checked:state.edit,click:()=>setEdit(!state.edit)},
    {label:'Settings…',click:()=>openSettings()},
    {type:'separator'},{label:'Quit',click:()=>app.quit()}
  ]));
}
function openSettings() {
  if(closing||!state)return;
  if(settingsWindow&&!settingsWindow.isDestroyed()){settingsWindow.show();settingsWindow.focus();return;}
  settingsWindow=new BrowserWindow({width:1180,height:860,minWidth:960,minHeight:720,show:false,backgroundColor:titleBar(state.settings).color,icon:join(__dirname,'assets/app-icon.png'),title:'Lyrics Overlay',titleBarStyle:'hidden',titleBarOverlay:titleBar(state.settings),autoHideMenuBar:true,webPreferences:preferences('settings')});
  secureWindow(settingsWindow,'settings');
  settingsWindow.once('ready-to-show',()=>{if(!closing)settingsWindow?.show();});
  settingsWindow.on('closed',()=>{settingsWindow=null;});
  void settingsWindow.loadFile(page('settings'));
}
function setEdit(value:boolean) {
  if(closing||!overlay||overlay.isDestroyed())return;
  state.edit=value;
  overlay.setFocusable(value);overlay.setIgnoreMouseEvents(!value,{forward:true});
  if(value){overlay.showInactive();}else if(!state.settings.visible)overlay.hide();
  if(!value && resizeTimer){clearInterval(resizeTimer);resizeTimer=undefined;saveGeometry();}
  broadcast();
}
async function registerShortcuts() {
  if(closing)return;
  globalShortcut.unregisterAll();
  state.warnings=state.warnings.filter(s=>!s.startsWith('Shortcut')&&!s.startsWith('الاختصار'));
  const updates:Partial<Settings>={};
  for(const [key,letter,fkey,callback] of [
    ['visibilityShortcut','L','F7',()=>void patchSettings({visible:!state.settings.visible})],
    ['editShortcut','E','F8',()=>setEdit(!state.edit)],
    ['positionShortcut','P','F9',()=>void restorePosition()]
  ] as const){
    const desired=state.settings[key];let registered='';
    for(const candidate of [desired,`Control+Alt+Shift+${letter}`,`Control+Shift+${fkey}`]){
      try{if(globalShortcut.register(candidate,callback)){registered=candidate;break;}}catch{}
    }
    if(!registered)state.warnings.push(`Shortcut ${desired} is unavailable. Choose another in Position & shortcuts.`);
    else if(registered!==desired)updates[key]=registered;
  }
  if(Object.keys(updates).length){await store.save(updates);state.settings=store.value;}
}
function patchSettings(patch:Partial<Settings>):Promise<void> {
  const next=writeQueue.then(async()=>{
    if(closing)return;
    const previous=state.settings;
    if(patch.monitor!==undefined&&patch.monitor!==previous.monitor&&!('x' in patch)&&!('y' in patch))patch={...patch,x:null,y:null};
    await store.save(patch);state.settings=store.value;
    if(closing)return;
    const s=state.settings;
    if(s.theme!==previous.theme&&settingsWindow&&!settingsWindow.isDestroyed())settingsWindow.setTitleBarOverlay(titleBar(s));
    if(['x','y','width','height','monitor'].some(k=>k in patch))overlay?.setBounds(geometry(s));
    if(s.visible||state.edit)overlay?.showInactive();else overlay?.hide();
    if(s.visibilityShortcut!==previous.visibilityShortcut||s.editShortcut!==previous.editShortcut||s.positionShortcut!==previous.positionShortcut)await registerShortcuts();
    if(s.autoStart!==previous.autoStart){
      if(app.isPackaged)app.setLoginItemSettings({openAtLogin:s.autoStart,path:process.execPath,args:['--background']});
      else warning('Startup registration is available in the installed app.');
    }
    if(s.onlineLyrics!==previous.onlineLyrics)void loadLyrics(true);
    if(['translationProvider','translationTarget','translationSource','translationModel','translationStyle','ollamaUrl'].some(key=>key in patch&&s[key as keyof Settings]!==previous[key as keyof Settings])){translationRequest?.abort();translationGeneration++;state.translations=[];state.translationStatus='Translation settings changed; choose Translate song';}
    if(s.showTranslation&&!previous.showTranslation&&!state.translations.length)void restoreCachedTranslation();
    broadcast();
  });
  writeQueue=next.catch(()=>{});return next;
}
async function restoreCachedTranslation(){
  const track=state.playback?.track,lyrics=state.lyrics,generation=translationGeneration;
  if(!track||!lyrics)return;
  const cached=await translator.cached(track,lyrics,state.settings);
  if(closing||generation!==translationGeneration||!state.settings.showTranslation||state.lyrics!==lyrics)return;
  if(cached){state.translations=cached;state.translationStatus='Cached translation ready';broadcast();}
}
async function restorePosition(){
  const saved=state.settings.savedPosition;
  if(state.edit)setEdit(false);
  await patchSettings(saved?{...saved,visible:true}:{x:null,y:null,visible:true});
}
function setMaterial(glass:boolean) {
  try{overlay?.setBackgroundMaterial(glass?'acrylic':'none');}
  catch{warning('Native acrylic is unavailable on this Windows configuration. The translucent surface remains enabled.');}
}
function saveGeometry() {
  if(closing||!state.edit||!overlay)return;
  clearTimeout(geometryTimer);
  geometryTimer=setTimeout(()=>{
    if(closing||!overlay||overlay.isDestroyed())return;
    const bounds=overlay.getBounds(),display=screen.getDisplayMatching(bounds);
    void patchSettings({...bounds,monitor:String(display.id)}).catch(()=>warning('Could not save overlay position.'));
  },250);
}
function receivePlayback(p:Playback) {
  if(closing)return;
  const previous=state.playback;
  const changed=!previous||previous.revision!==p.revision||previous.track?.uri!==p.track?.uri;
  state.playback=p;
  if(changed){
    translationRequest?.abort();translationGeneration++;state.translations=[];state.translationStatus='This song has not been translated';
    state.lyrics=null;state.plainIndex=0;state.trackOffsetMs=p.track ? offsets[trackKey(p.track)]??0 : 0;
    void loadLyrics();
  }
  broadcast();
}
async function loadLyrics(refresh=false) {
  lyricRequest?.abort();const generation=++requestGeneration;
  const p=state.playback;
  if(!p?.track){state.status='Connected; play a song in Spotify';state.lyrics=null;broadcast();return;}
  const controller=new AbortController();lyricRequest=controller;state.status='Finding lyrics…';broadcast();
  try {
    const lyrics=await lyricsStore.find(p.track,controller.signal,state.settings.onlineLyrics,refresh);
    if(generation!==requestGeneration||controller.signal.aborted)return;
    const changedText=JSON.stringify(state.lyrics?.lines.map(l=>l.text))!==JSON.stringify(lyrics?.lines.map(l=>l.text));
    if(changedText){translationRequest?.abort();translationGeneration++;state.translations=[];}
    state.lyrics=lyrics;
    state.status=!lyrics?'No matching lyrics; import a local file':lyrics.kind==='plain'?'Unsynced lyrics; select a line in settings':lyrics.kind==='instrumental'?'Instrumental · no lyrics':`${lyrics.source} · ${lyrics.kind==='word'?'Word-synced':'Line-synced'}`;
    if(lyrics&&state.settings.showTranslation){
      const cached=await translator.cached(p.track,lyrics,state.settings);
      if(generation!==requestGeneration||controller.signal.aborted)return;
      if(cached){state.translations=cached;state.translationStatus='Cached translation ready';}
    }
  } catch {
    if(generation!==requestGeneration||controller.signal.aborted)return;
    state.status='Lyrics provider unavailable; retry or import a file';state.lyrics=null;
  }
  broadcast();
}
function authorize(event:IpcMainInvokeEvent,role?:'overlay'|'settings') {
  const win=BrowserWindow.fromWebContents(event.sender);
  if(event.senderFrame!==event.sender.mainFrame||!win||
      !(win===overlay&&event.sender.getURL()===url('overlay')||win===settingsWindow&&event.sender.getURL()===url('settings'))||
      role==='settings'&&win!==settingsWindow||role==='overlay'&&win!==overlay)throw new Error('Untrusted renderer');
}
function installIpc() {
  ipcMain.handle('state',(e)=>{authorize(e);return state;});
  ipcMain.handle('settings',async(e,patch:unknown)=>{
    authorize(e,'settings');const valid=settingsSchema.partial().strict().parse(patch);
    // Zod defaults can populate omitted fields even in a partial object. Persist only explicitly supplied keys.
    const supplied=Object.fromEntries(Object.keys(patch as object).map(key=>[key,valid[key as keyof Settings]]));
    if('ollamaUrl' in supplied)localOllamaUrl(String(supplied.ollamaUrl));
    await patchSettings(supplied);
  });
  ipcMain.handle('displays',(e)=>{authorize(e,'settings');return screen.getAllDisplays().map((d,i)=>({id:String(d.id),label:`${d.label||`Display ${i+1}`} · ${d.size.width} × ${d.size.height}${d.id===screen.getPrimaryDisplay().id?' · Primary':''}`}));});
  ipcMain.handle('offset',async(e,value:unknown)=>{
    authorize(e,'settings');const ms=z.number().int().min(-30000).max(30000).parse(value);
    if(!state.playback?.track)return;
    offsets[trackKey(state.playback.track)]=ms;
    await atomicJson(join(app.getPath('userData'),'offsets.json'),offsets);state.trackOffsetMs=ms;broadcast();
  });
  ipcMain.handle('translation-key',async(e,value:unknown)=>{
    authorize(e,'settings');const key=z.string().max(500).parse(value).trim();
    if(key&&!safeStorage.isEncryptionAvailable())throw new Error('Windows encryption is unavailable. The key cannot be saved securely.');
    await atomicJson(join(app.getPath('userData'),'secrets.json'),key?{gemini:safeStorage.encryptString(key).toString('base64')}:{});
    translationKey=key;state.translationKeySet=!!key;broadcast();
  });
  ipcMain.handle('resize',(e,active:unknown)=>{
    authorize(e,'overlay');if(typeof active!=='boolean'||!state.edit||!overlay)return;
    if(resizeTimer){clearInterval(resizeTimer);resizeTimer=undefined;saveGeometry();}
    if(!active)return;
    const start=screen.getCursorScreenPoint(),bounds=overlay.getBounds(),at=Date.now();
    resizeTimer=setInterval(()=>{
      if(!overlay||!state.edit||Date.now()-at>15000){clearInterval(resizeTimer);resizeTimer=undefined;saveGeometry();return;}
      const pos=screen.getCursorScreenPoint();
      overlay.setBounds({...bounds,width:Math.max(240,Math.min(2400,bounds.width+pos.x-start.x)),height:Math.max(40,Math.min(600,bounds.height+pos.y-start.y))});
    },16);
  });
  ipcMain.handle('action',async(e,raw:unknown,option:unknown)=>{
    authorize(e);
    const action=z.enum(['toggle','edit','settings','pair','import','clearImport','refresh','install','resetPosition','resetPairing','selectPlain','savePosition','restorePosition','place','translate','cancelTranslation','openLink']).parse(raw);
    if(BrowserWindow.fromWebContents(e.sender)===overlay&&!['edit','settings'].includes(action))throw new Error('Settings window required');
    if(action==='toggle')await patchSettings({visible:!state.settings.visible});
    if(action==='edit')setEdit(!state.edit);
    if(action==='settings')openSettings();
    if(action==='pair')return bridge.createPairing();
    if(action==='selectPlain'&&state.lyrics?.kind==='plain'){
      const index=z.coerce.number().int().min(0).max(state.lyrics.lines.length-1).parse(option);
      state.plainIndex=index;broadcast();
    }
    if(action==='resetPairing'){await bridge.revoke();return 'Pairing removed. Generate a new code to reconnect Spotify.';}
    if(action==='resetPosition')await patchSettings({x:null,y:null});
    if(action==='refresh')await loadLyrics(true);
    if(action==='install')return installExtension();
    if(action==='savePosition'&&overlay){const bounds=overlay.getBounds();await patchSettings({savedPosition:{...bounds,monitor:String(screen.getDisplayMatching(bounds).id)}});return 'Position saved. Use your position shortcut to show lyrics here.';}
    if(action==='restorePosition')await restorePosition();
    if(action==='place'){
      const placement=z.enum(['top','center','bottom']).parse(option),area=displayFor(state.settings).workArea,s=state.settings;
      await patchSettings({x:Math.round(area.x+(area.width-s.width)/2),y:placement==='top'?area.y+24:placement==='bottom'?area.y+area.height-s.height-36:Math.round(area.y+(area.height-s.height)/2),visible:true});
    }
    if(action==='translate'){void translateCurrent();return null;}
    if(action==='cancelTranslation'){translationRequest?.abort();translationGeneration++;state.translationStatus='Translation stopped';broadcast();}
    if(action==='openLink'){
      const key=z.enum(['website','github','x','instagram','email','repository','releases','geminiKey']).parse(option);await shell.openExternal(developer.links[key]);
    }
    if(action==='clearImport'&&state.playback?.track){await lyricsStore.clearImport(state.playback.track);await loadLyrics(true);}
    if(action==='import') {
      const track=state.playback?.track;
      if(!track)throw new Error('Play a song in Spotify before importing lyrics.');
      const selected=await dialog.showOpenDialog(settingsWindow!,{title:`Import lyrics for ${track.title}`,properties:['openFile'],filters:[{name:'Lyrics',extensions:['lrc','ttml','xml','txt']}]});
      if(selected.canceled||!selected.filePaths[0])return null;
      const file=selected.filePaths[0];if((await stat(file)).size>2_000_000)throw new Error('Lyrics files must be smaller than 2 MB.');
      const text=await readFile(file,'utf8');
      const lyrics=/\.(ttml|xml)$/i.test(file)?parseTtml(text,track.durationMs,option==='absolute'):/\.lrc$/i.test(file)?parseLrc(text,track.durationMs):plainLyrics(text);
      await lyricsStore.import(track,lyrics);
      if(state.playback?.track&&trackKey(state.playback.track)===trackKey(track))await loadLyrics();
      return `Imported ${lyrics.lines.length} lines for ${track.title}.`;
    }
    return null;
  });
}
async function installExtension():Promise<string> {
  if(state.connectionPhase==='installing')return 'Preparing connection…';
  state.connectionPhase='installing';state.setupStatus='Preparing the extension and local connection…';broadcast();
  try{
  if(!bridge?.listening)throw new Error('Local service unavailable. Close other copies and restart.');
  const source=app.isPackaged?join(process.resourcesPath,'lyrics-overlay.js'):join(__dirname,'extension/lyrics-overlay.js');
  let configDir:string;
  try {configDir=(await run('spicetify',['-c'],{windowsHide:true,timeout:10000})).stdout.trim();}
  catch {throw new Error('Spicetify was not found on PATH. Install it first, then reopen the companion.');}
  // spicetify -c returns the absolute config file path.
  const {dirname,isAbsolute}=await import('node:path');
  if(!isAbsolute(configDir)||!configDir.endsWith('.ini'))throw new Error('Could not locate the Spicetify config file. Use scripts/install-extension.ps1.');
  const folder=join(dirname(configDir),'Extensions');await mkdir(folder,{recursive:true});
  const original=await readFile(source,'utf8');
  if(!original.includes('__LYRICS_OVERLAY_LOCAL_TOKEN__'))throw new Error('The extension does not match this app. Download the latest release.');
  const token=await bridge.provision();
  await writeFile(join(folder,'lyrics-overlay.js'),original.replace('__LYRICS_OVERLAY_LOCAL_TOKEN__',token),{mode:0o600});
  await run('spicetify',['config','extensions','lyrics-overlay.js'],{windowsHide:true,timeout:10000});
  state.setupStatus='Applying to Spotify; Spotify may restart…';broadcast();
  await run('spicetify',['apply'],{windowsHide:true,timeout:60000,maxBuffer:1024*1024});
  if(!state.connected){state.connectionPhase='waiting';state.setupStatus='Extension ready. Open Spotify to connect automatically.';}
  broadcast();return state.connected?'Spotify connected successfully.':'Extension ready. Open Spotify to connect.';
  }catch(error){state.connectionPhase='error';state.setupStatus=error instanceof Error?error.message:'Could not set up Spotify';broadcast();throw error;}
}
async function translateCurrent(){
  const track=state.playback?.track,lyrics=state.lyrics;
  if(!track||!lyrics?.lines.length){state.translationStatus='Play a song with lyrics first';broadcast();return;}
  translationRequest?.abort();const generation=++translationGeneration,controller=new AbortController();translationRequest=controller;
  state.translationStatus='Preparing translation…';broadcast();
  try{
    await patchSettings({showTranslation:true});
    const lines=await translator.translate(track,lyrics,state.settings,translationKey,controller.signal,(lines,done,total)=>{
      if(generation!==translationGeneration||controller.signal.aborted)return;
      state.translations=lines;state.translationStatus=`Translating · ${done} / ${total}`;broadcast();
    });
    if(generation!==translationGeneration||controller.signal.aborted)return;
    state.translations=lines;state.translationStatus='Translation ready and cached for this song';
  }catch(error){if(generation!==translationGeneration||controller.signal.aborted)return;state.translationStatus=error instanceof Error?error.message:'Translation failed';}
  broadcast();
}
