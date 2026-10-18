import { z } from 'zod';

import {PORT,PROTOCOL} from './protocol';
export {PORT,PROTOCOL};
export const trackSchema = z.object({
  uri: z.string().min(1).max(500), title: z.string().min(1).max(500),
  artist: z.string().min(1).max(500), album: z.string().max(500),
  durationMs: z.number().finite().min(0).max(86_400_000)
  ,artwork:z.string().regex(/^https:\/\/i\.scdn\.co\/image\/[a-f\d]{20,80}$/i).optional()
});
export type Track = z.infer<typeof trackSchema>;
export const playbackSchema = z.object({
  type: z.literal('playback'), protocol: z.literal(PROTOCOL), seq: z.number().int().nonnegative(),
  revision: z.string().min(1).max(600), track: trackSchema.nullable(),
  positionMs: z.number().finite().min(0).max(86_400_000), playing: z.boolean()
});
export type Playback = z.infer<typeof playbackSchema>;
export const messageSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('auth'), protocol: z.literal(PROTOCOL), token: z.string().max(128).optional(), code: z.string().regex(/^\d{8}$/).optional()}),
  playbackSchema,
  z.object({type: z.literal('command'), action: z.enum(['toggle', 'settings'])})
]);
export type Word = { startMs: number; endMs: number; from: number; to: number };
export type LyricLine = { startMs: number; endMs: number; text: string; words?: Word[] };
export type Lyrics = { kind: 'synced' | 'word' | 'plain' | 'instrumental'; lines: LyricLine[]; source: string; fetchedAt: number };
export const fontSchema=z.enum(['auto','Inter','Manrope','Outfit','Rubik','Tajawal','Cairo','Noto Sans JP','Segoe UI','Arial','Georgia','Verdana','Consolas']);
export const settingsSchema = z.object({
  surface:z.enum(['text','pill','glass','sign']).default('text'),
  surfaceColor:z.string().regex(/^#[\da-f]{6}$/i).default('#202033'),surfaceOpacity:z.number().min(.1).max(1).default(.82),
  surfaceRadius:z.number().min(0).max(60).default(24),surfaceBorder:z.string().regex(/^#[\da-f]{6}$/i).default('#bcb5ff'),
  lineTransition:z.enum(['slide','rise','crossfade','blur','zoom','none']).default('rise'),
  wordAnimation:z.enum(['glow','pulse','bounce','none']).default('glow'),
  respectSystemMotion:z.boolean().default(false),
  glowColor:z.string().regex(/^#[\da-f]{6}$/i).default('#bcb5ff'),
  showCreatorCredits:z.boolean().default(true),
  autoFit:z.boolean().default(true),
  theme:z.enum(['midnight','graphite','ocean','forest','light']).default('midnight'),
  wordHighlight:z.enum(['word','sweep','off']).default('word'),
  wordTiming:z.enum(['estimate','exact']).default('estimate'),
  wordUnderline:z.boolean().default(true),
  showArtwork:z.boolean().default(true),tourComplete:z.boolean().default(false),
  visible: z.boolean().default(true), monitor: z.string().max(100).default('primary'),
  x: z.number().finite().nullable().default(null), y: z.number().finite().nullable().default(null),
  width: z.number().int().min(240).max(2400).default(680), height: z.number().int().min(40).max(600).default(116),
  font: fontSchema.default('auto'),
  fontSize: z.number().min(12).max(80).default(24), fontWeight: z.number().int().min(300).max(900).default(500),
  color: z.string().regex(/^#[\da-f]{6}$/i).default('#f5f5f7'), highlight: z.string().regex(/^#[\da-f]{6}$/i).default('#b8ffd5'),
  opacity: z.number().min(.1).max(1).default(1), shadow: z.number().min(0).max(20).default(3), glow: z.number().min(0).max(30).default(0),
  border: z.boolean().default(false), borderWidth: z.number().min(0).max(6).default(1), radius: z.number().min(0).max(60).default(0),
  glass: z.boolean().default(false), align: z.enum(['left', 'center', 'right']).default('center'),
  vertical: z.enum(['top', 'center', 'bottom']).default('center'), lines: z.enum(['one', 'two']).default('one'),
  direction: z.enum(['auto', 'rtl', 'ltr']).default('auto'),
  preset: z.enum(['slide', 'fade', 'karaoke', 'minimal', 'dynamic']).default('slide'),
  entranceMs: z.number().min(0).max(2000).default(360), exitMs: z.number().min(0).max(1000).default(100),
  holdMs: z.number().min(0).max(1000).default(0), reducedMotion: z.boolean().default(false),
  offsetMs: z.number().int().min(-30000).max(30000).default(0), autoStart: z.boolean().default(false),
  onlineLyrics: z.boolean().default(true),
  showNext: z.boolean().default(true), nextOpacity: z.number().min(.1).max(.8).default(.38),
  showTranslation: z.boolean().default(false), translationProvider: z.enum(['auto','gemini','ollama','mymemory']).default('auto'),
  translationTarget: z.enum(['auto','ar','en','fa','ur','he','ja','ko','zh','fr','es','de','tr']).default('auto'),
  translationSource: z.enum(['auto','ar','en','fa','ur','he','ja','ko','zh','fr','es','de','tr']).default('auto'),
  translationModel: z.string().min(1).max(120).default('gemini-3.8-flash'),
  translationStyle:z.enum(['natural','faithful','poetic']).default('natural'),
  translationFont:fontSchema.default('auto'),
  translationSize:z.number().min(.5).max(1.2).default(.68),
  translationOpacity:z.number().min(.2).max(1).default(.85),
  translationColor:z.string().regex(/^#[\da-f]{6}$/i).default('#c6c3d5'),
  translationPlacement:z.enum(['above','below']).default('below'),
  translationGlow:z.number().min(0).max(24).default(0),
  ollamaUrl: z.string().url().max(300).default('http://127.0.0.1:11434'),
  savedPosition: z.object({x:z.number().finite(),y:z.number().finite(),width:z.number().int().min(240).max(2400),height:z.number().int().min(40).max(600),monitor:z.string().max(100)}).nullable().default(null),
  visibilityShortcut: z.string().min(1).max(100).default('Control+Alt+L'), editShortcut: z.string().min(1).max(100).default('Control+Alt+E'),
  positionShortcut: z.string().min(1).max(100).default('Control+Alt+P')
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaults = settingsSchema.parse({});
export type AppState = {
  settings: Settings; connected: boolean; playback: Playback | null; lyrics: Lyrics | null;
  status: string; edit: boolean; warnings: string[]; trackOffsetMs: number; plainIndex: number;
  setupStatus: string; connectionPhase: 'idle'|'installing'|'waiting'|'connected'|'error';
  translations: string[]; translationStatus: string; translationKeySet: boolean;
  translationBusy:boolean;profiles:string[];
};
export type DisplayInfo = { id: string; label: string };
export interface OverlayAPI {
  getState(): Promise<AppState>;
  subscribe(callback: (state: AppState) => void): () => void;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  action(action: 'toggle' | 'edit' | 'settings' | 'pair' | 'import' | 'clearImport' | 'refresh' | 'install' | 'resetPosition' | 'resetPairing' | 'selectPlain' | 'savePosition' | 'restorePosition' | 'place' | 'translate' | 'cancelTranslation' | 'openLink' | 'saveProfile' | 'loadProfile' | 'deleteProfile' | 'exportSettings' | 'importSettings', option?: string): Promise<string | null>;
  displays(): Promise<DisplayInfo[]>;
  setTrackOffset(ms: number): Promise<void>;
  resize(active: boolean): Promise<void>;
  setTranslationKey(key: string): Promise<void>;
}
declare global { interface Window { overlay: OverlayAPI } }
