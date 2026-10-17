import { z } from 'zod';
import type { Lyrics, Track } from '../shared/model';
import { parseLrc, plainLyrics } from './parsers';

export interface LyricsProvider { readonly name: string; find(track: Track, signal: AbortSignal): Promise<Lyrics | null> }
const recordSchema = z.object({
  trackName: z.string(), artistName: z.string(), albumName: z.string(), duration: z.number(),
  instrumental: z.boolean(), syncedLyrics: z.string().nullable(), plainLyrics: z.string().nullable()
});
export type LrcRecord = z.infer<typeof recordSchema>;
export const normalize = (s: string) => s.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[\p{P}\p{Z}\s]+/gu, ' ').trim();
export function matches(track: Track, candidate: Pick<LrcRecord, 'trackName' | 'artistName' | 'albumName' | 'duration'>, strictAlbum = true): boolean {
  // Keep version words (live, remix, remaster, acoustic) intact. Never strip them to force a match.
  return normalize(track.title) === normalize(candidate.trackName) &&
    normalize(track.artist) === normalize(candidate.artistName) &&
    (!track.album || !strictAlbum || normalize(track.album) === normalize(candidate.albumName)) &&
    Math.abs(track.durationMs / 1000 - candidate.duration) <= 2;
}
export class LrclibProvider implements LyricsProvider {
  readonly name = 'LRCLIB';
  constructor(private request: typeof fetch = fetch) {}
  private async json(path: string, params: URLSearchParams, signal: AbortSignal) {
    const response = await this.request(`https://lrclib.net/api/${path}?${params}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      headers: { 'User-Agent': 'SpicetifyLyricsOverlay/1.0.0 (desktop lyrics companion)', Accept: 'application/json' }
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`LRCLIB returned HTTP ${response.status}.`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > 2_000_000) throw new Error('Provider response is too large.');
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) { await reader.cancel(); throw new Error('Provider response is too large.'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  }
  async find(track: Track, signal: AbortSignal): Promise<Lyrics | null> {
    const params = new URLSearchParams({track_name: track.title, artist_name: track.artist, album_name: track.album, duration: String(track.durationMs / 1000)});
    const exact = recordSchema.safeParse(await this.json('get', params, signal));
    let candidate = exact.success && matches(track, exact.data) ? exact.data : null;
    if (!candidate) {
      // Search fallback still applies identical metadata/duration checks; no fuzzy guess is displayed.
      const raw = await this.json('search', new URLSearchParams({track_name: track.title, artist_name: track.artist}), signal);
      const list = z.array(recordSchema).safeParse(raw);
      candidate = list.success ? list.data.find(item => matches(track, item)) ?? null : null;
    }
    if (!candidate) return null;
    if (candidate.instrumental) return {kind:'instrumental', lines:[], source:this.name, fetchedAt:Date.now()};
    if (candidate.syncedLyrics) return parseLrc(candidate.syncedLyrics, track.durationMs, this.name);
    if (candidate.plainLyrics) return plainLyrics(candidate.plainLyrics, this.name);
    return null;
  }
}
