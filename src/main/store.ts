import { mkdir, readFile, rename, writeFile, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { settingsSchema, defaults, type Settings, type Track, type Lyrics } from '../shared/model';
import type { LyricsProvider } from '../lyrics/provider';

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T; } catch { return fallback; }
}
export async function atomicJson(path: string, data: unknown) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), {mode:0o600});
  await rename(tmp, path);
}
export class SettingsStore {
  value: Settings = {...defaults};
  constructor(private dir: string) {}
  async load() {
    await mkdir(this.dir, {recursive:true});
    const raw = await readJson(join(this.dir, 'settings.json'), {});
    // Recover individual valid fields if a hand-edited settings file contains one invalid entry.
    const full = settingsSchema.safeParse(raw);
    this.value = full.success ? full.data : {...defaults};
  }
  async save(patch: Partial<Settings>) {
    const value = settingsSchema.parse({...this.value, ...patch});
    await atomicJson(join(this.dir, 'settings.json'), value);
    this.value = value;
  }
}
export const trackKey = (track: Track) => createHash('sha256').update(JSON.stringify([track.uri,track.title,track.artist,track.album,track.durationMs])).digest('hex');
type Cache = {track: Track; lyrics: Lyrics | null; savedAt: number};
export class LyricsStore {
  private writes = 0;
  constructor(private dir: string, private providers: LyricsProvider[]) {}
  async initialize() { await mkdir(join(this.dir,'cache'),{recursive:true}); await mkdir(join(this.dir,'imports'),{recursive:true}); await this.prune(); }
  async find(track: Track, signal: AbortSignal, online: boolean, refresh = false): Promise<Lyrics | null> {
    const key = trackKey(track);
    const imported = await readJson<Cache | null>(join(this.dir,'imports',`${key}.json`),null);
    if (imported) return imported.lyrics;
    const path = join(this.dir,'cache',`${key}.json`);
    const cached = await readJson<Cache | null>(path,null);
    const maxAge = cached?.lyrics ? 7*86400000 : 15*60000;
    if (!refresh && cached && Date.now()-cached.savedAt < maxAge) return cached.lyrics;
    if (!online) return cached?.lyrics ?? null;
    let failure: unknown;
    for (const provider of this.providers) {
      signal.throwIfAborted();
      try {
        const lyrics = await provider.find(track,signal);
        signal.throwIfAborted();
        if (lyrics) { await atomicJson(path,{track,lyrics,savedAt:Date.now()}); if (++this.writes % 20 === 0) await this.prune(); return lyrics; }
      } catch (error) { signal.throwIfAborted(); failure = error; }
    }
    if (cached?.lyrics) return cached.lyrics; // Offline resilience, including expired successful entries.
    if (failure) throw failure;
    await atomicJson(path,{track,lyrics:null,savedAt:Date.now()});
    if (++this.writes % 20 === 0) await this.prune();
    return null;
  }
  async import(track: Track, lyrics: Lyrics) { await atomicJson(join(this.dir,'imports',`${trackKey(track)}.json`),{track,lyrics,savedAt:Date.now()}); }
  async clearImport(track: Track) { await unlink(join(this.dir,'imports',`${trackKey(track)}.json`)).catch(()=>{}); }
  async prune() {
    const dir = join(this.dir,'cache');
    const files = await Promise.all((await readdir(dir)).filter(f=>f.endsWith('.json')).map(async name=>({name, ...(await stat(join(dir,name)))})));
    files.sort((a,b)=>b.mtimeMs-a.mtimeMs);
    let total = 0;
    for (let i=0;i<files.length;i++) { const f=files[i]!; total+=f.size; if (i>=500 || total>32*1024*1024) await unlink(join(dir,f.name)).catch(()=>{}); }
  }
}
