import type { LyricLine, Playback } from './model';

// Time is anchored to each process's own monotonic clock. No wall-clock deltas cross processes.
export class PlaybackClock {
  private snapshot: Playback | null = null;
  private at = 0;
  update(snapshot: Playback | null, now: number) { this.snapshot = snapshot; this.at = now; }
  position(now: number): number {
    const s = this.snapshot;
    if (!s?.track) return 0;
    return Math.min(s.track.durationMs, Math.max(0, s.positionMs + (s.playing ? Math.max(0, now - this.at) : 0)));
  }
}
export function lineAt(lines: LyricLine[], position: number): number {
  let lo = 0, hi = lines.length - 1, result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (lines[mid]!.startMs <= position) { result = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return result >= 0 && position < lines[result]!.endMs ? result : -1;
}
export function directionOf(text: string, override: 'auto' | 'ltr' | 'rtl' = 'auto'): 'ltr' | 'rtl' {
  if (override !== 'auto') return override;
  // First strong letter, skipping punctuation, digits, combining marks and emoji.
  for (const char of text) {
    if (!/\p{L}/u.test(char)) continue;
    return /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Adlam}]/u.test(char) ? 'rtl' : 'ltr';
  }
  return 'ltr';
}
export function fontFor(text: string, chosen: string): string {
  if (chosen !== 'auto') return `"${chosen}", "Segoe UI", sans-serif`;
  if (/\p{Script=Arabic}/u.test(text)) return 'Cairo, "Segoe UI", sans-serif';
  if (/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text)) return '"Noto Sans JP", "Yu Gothic UI", sans-serif';
  return 'Inter, "Segoe UI", "Malgun Gothic", sans-serif';
}
export function graphemes(text: string): string[] {
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(s => s.segment);
}
export function followingLine(lines:LyricLine[],index:number,position:number):LyricLine|null {
  for(let i=Math.max(0,index+1);i<lines.length;i++)if(lines[i]!.text.trim()&&(index>=0||lines[i]!.startMs>position))return lines[i]!;
  return null;
}
