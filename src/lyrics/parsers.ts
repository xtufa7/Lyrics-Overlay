import { DOMParser } from '@xmldom/xmldom';
import type { LyricLine, Lyrics, Word } from '../shared/model';

const MAX_LENGTH = 2_000_000;
function checkInput(text: string) {
  if (text.length > MAX_LENGTH) throw new Error('Lyrics file exceeds the 2 MB limit.');
}
export function plainLyrics(text: string, source = 'Local file'): Lyrics {
  checkInput(text);
  return { kind: 'plain', source, fetchedAt: Date.now(), lines: text.split(/\r?\n/).filter(s => s.trim()).map(text => ({ text, startMs: 0, endMs: 86_400_000 })) };
}
export function parseLrc(input: string, duration = 86_400_000, source = 'Local LRC'): Lyrics {
  checkInput(input);
  const offset = Number(input.match(/\[offset:\s*(-?\d+)\]/i)?.[1] ?? 0);
  const lines: LyricLine[] = [];
  for (const row of input.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const stamps = [...row.matchAll(/\[(\d{1,4}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    const text = row.replace(/\[[^\]]*\]/g, '').trim();
    for (const stamp of stamps) {
      if (Number(stamp[2]) >= 60) continue;
      const startMs = Number(stamp[1]) * 60000 + Number(stamp[2]) * 1000 + Number((stamp[3] ?? '').padEnd(3, '0')) + offset;
      lines.push({ startMs: Math.max(0, startMs), endMs: duration, text });
    }
  }
  lines.sort((a, b) => a.startMs - b.startMs);
  // Simultaneous vocal lines remain a single cue; blank timed cues explicitly clear the overlay.
  const merged: LyricLine[] = [];
  for (const line of lines) {
    const last = merged.at(-1);
    if (last?.startMs === line.startMs) last.text += `${last.text && line.text ? '\n' : ''}${line.text}`;
    else merged.push(line);
  }
  merged.forEach((line, i) => line.endMs = merged[i + 1]?.startMs ?? Math.max(duration, line.startMs + 1));
  if (!merged.length) return plainLyrics(input.replace(/\[(ar|al|ti|by|offset|length):[^\]]*\]/gi, ''), source);
  return { kind: 'synced', source, fetchedAt: Date.now(), lines: merged };
}

export function parseTime(value: string, frameRate = 30, tickRate = 1): number {
  const clock = value.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d+)|:(\d{2})(?:\.(\d+))?)?$/);
  if (clock) {
    if (Number(clock[2]) >= 60 || Number(clock[3]) >= 60) throw new Error('Invalid TTML clock time.');
    return (Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]) +
      (clock[4] ? Number(`0.${clock[4]}`) : (Number(clock[5] ?? 0) + Number(`0.${clock[6] ?? 0}`)) / frameRate)) * 1000;
  }
  const offset = value.match(/^(\d+(?:\.\d+)?)(ms|h|m|s|f|t)$/);
  if (!offset) throw new Error(`Unsupported TTML time: ${value.slice(0, 40)}`);
  return Number(offset[1]) * ({ms: 1, h: 3600000, m: 60000, s: 1000, f: 1000 / frameRate, t: 1000 / tickRate}[offset[2]!]!);
}

// W3C parallel containers with relative begin/end; absolute mode supports common exported music TTML.
// Sequential containers are explicitly rejected rather than silently inventing timing.
export function parseTtml(input: string, duration = 86_400_000, absolute = false): Lyrics {
  checkInput(input);
  if (/<!DOCTYPE|<!ENTITY/i.test(input)) throw new Error('DTD and entity declarations are not accepted.');
  const doc = new DOMParser({ onError: (level, message) => { if (level !== 'warning') throw new Error(message); } }).parseFromString(input, 'text/xml');
  const root = doc.documentElement;
  if (!root || root.localName !== 'tt') throw new Error('Expected a TTML <tt> document.');
  const attr = (name: string) => root.getAttributeNS('http://www.w3.org/ns/ttml#parameter', name) || root.getAttribute(`ttp:${name}`);
  const multiplier = (attr('frameRateMultiplier') || '1 1').split(/\s+/).map(Number);
  const frameRate = Number(attr('frameRate') || 30) * multiplier[0]! / multiplier[1]!;
  const tickRate = Number(attr('tickRate') || 1);
  if (!(frameRate > 0) || !(tickRate > 0) || !Number.isFinite(frameRate)) throw new Error('Invalid TTML timing rate.');
  if (attr('timeBase') && !['media', 'smpte'].includes(attr('timeBase')!)) throw new Error('Only media/SMPTE TTML time bases are supported.');
  if (attr('dropMode') && attr('dropMode') !== 'nonDrop') throw new Error('Drop-frame TTML is not supported.');
  const time = (s: string) => parseTime(s, frameRate, tickRate);
  const lines: LyricLine[] = [];
  type El = typeof root;
  function bounds(el: El, parentStart: number, parentEnd: number) {
    const base = absolute ? 0 : parentStart;
    const start = el.hasAttribute('begin') ? base + time(el.getAttribute('begin')!) : parentStart;
    const end = el.hasAttribute('end') ? Math.min(parentEnd, base + time(el.getAttribute('end')!)) :
      el.hasAttribute('dur') ? Math.min(parentEnd, start + time(el.getAttribute('dur')!)) : parentEnd;
    if (start < 0 || end <= start) throw new Error('TTML cue has an invalid or empty time range. Try the absolute timing import option for music exports.');
    return {start, end};
  }
  function visit(el: El, parentStart: number, parentEnd: number, depth: number) {
    if (depth > 40) throw new Error('TTML nesting exceeds 40 levels.');
    if (el.getAttribute('timeContainer') === 'seq') throw new Error('Sequential TTML containers are not supported. Export parallel timing.');
    const {start, end} = bounds(el, parentStart, parentEnd);
    if (el.localName !== 'p') {
      for (let child = el.firstChild; child; child = child.nextSibling) if (child.nodeType === 1) visit(child as El, start, end, depth + 1);
      return;
    }
    let text = '';
    const words: Word[] = [];
    function collect(node: El, begin: number, finish: number, nesting: number) {
      if (nesting > 40) throw new Error('TTML nesting exceeds 40 levels.');
      const own = bounds(node, begin, finish);
      const from = text.length;
      const wordCount = words.length;
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 3 || child.nodeType === 4) text += child.nodeValue?.replace(/[\t\r\n ]+/g, ' ') ?? '';
        else if (child.nodeType === 1) {
          const ce = child as El;
          if (ce.localName === 'br') text += '\n';
          else collect(ce, own.start, own.end, nesting + 1);
        }
      }
      // Only use explicitly timed spans. Untimed content receives no invented word timestamps.
      if (node.localName === 'span' && node.hasAttribute('begin') && words.length === wordCount && text.slice(from).trim()) {
        words.push({ startMs: own.start, endMs: own.end, from, to: text.length });
      }
    }
    // The paragraph's timing is already resolved, so walk its children without reapplying begin.
    for (let child = el.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3 || child.nodeType === 4) text += child.nodeValue?.replace(/[\t\r\n ]+/g, ' ') ?? '';
      else if (child.nodeType === 1 && (child as El).localName === 'br') text += '\n';
      else if (child.nodeType === 1) collect(child as El, start, end, 0);
    }
    if (text.trim()) lines.push({startMs: start, endMs: end, text, ...(words.length ? {words} : {})});
  }
  visit(root, 0, duration, 0);
  lines.sort((a, b) => a.startMs - b.startMs);
  if (!lines.length) throw new Error('No timed TTML paragraphs were found.');
  // This slim overlay uses one cue at a time. Reject overlapping paragraphs to avoid silently losing voices.
  for (let i = 1; i < lines.length; i++) if (lines[i]!.startMs < lines[i - 1]!.endMs - 1) throw new Error('Overlapping TTML paragraphs are not supported. Export a single vocal part.');
  return { kind: lines.some(l => l.words?.length) ? 'word' : 'synced', source: 'Local TTML', fetchedAt: Date.now(), lines };
}
