import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, OverlayAPI } from '../shared/model';

// Each renderer receives only its role's capabilities. No raw IPC or filesystem APIs cross the bridge.
const settings = process.argv.includes('--overlay-role=settings');
const api: OverlayAPI = {
  getState:()=>ipcRenderer.invoke('state'),
  subscribe:(callback)=>{
    const listener=(_event:Electron.IpcRendererEvent,state:AppState)=>callback(state);
    ipcRenderer.on('state',listener);return()=>ipcRenderer.removeListener('state',listener);
  },
  updateSettings:(patch)=>settings ? ipcRenderer.invoke('settings',patch) : Promise.reject(new Error('Settings window required')),
  action:(action,option)=>ipcRenderer.invoke('action',action,option),
  displays:()=>settings ? ipcRenderer.invoke('displays') : Promise.resolve([]),
  setTrackOffset:(ms)=>settings ? ipcRenderer.invoke('offset',ms) : Promise.reject(new Error('Settings window required')),
  resize:(active)=>ipcRenderer.invoke('resize',active),
  setTranslationKey:(key)=>settings?ipcRenderer.invoke('translation-key',key):Promise.reject(new Error('Settings window required'))
};
contextBridge.exposeInMainWorld('overlay',api);
