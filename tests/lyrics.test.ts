import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, parseTtml, parseTime, plainLyrics } from '../src/lyrics/parsers';
import { matches, LrclibProvider } from '../src/lyrics/provider';
import { directionOf, graphemes, PlaybackClock, lineAt } from '../src/shared/timing';
import { defaults, playbackSchema, settingsSchema, type Playback, type Track } from '../src/shared/model';

const track:Track={uri:'spotify:track:test',title:'Night (Live)',artist:'Example',album:'Session',durationMs:180000};
const record={trackName:track.title,artistName:track.artist,albumName:track.album,duration:180,instrumental:false,syncedLyrics:'[00:01.00]Original fixture line',plainLyrics:null};
test('LRC supports repeated timestamps, fractions, offset and explicit blank cues',()=>{
  const lyrics=parseLrc('[ar:Fixture]\n[offset:-50]\n[00:01.5][00:03.50]مرحبا بالعالم\n[00:05.123]\n[00:07]End',10000);
  assert.equal(lyrics.kind,'synced');assert.deepEqual(lyrics.lines.map(l=>l.startMs),[1450,3450,5073,6950]);
  assert.equal(lyrics.lines[1]!.endMs,5073);assert.equal(lyrics.lines[2]!.text,'');assert.equal(lyrics.lines[3]!.endMs,10000);
  assert.ok(lyrics.lines.every(l=>!l.words));
});
test('LRC simultaneous cues merge and unsynchronized data stays unsynchronized',()=>{
  assert.equal(parseLrc('[00:01]One\n[00:01]Two',10000).lines[0]!.text,'One\nTwo');
  assert.equal(parseLrc('[ti:Fixture]\nNo timestamps here').kind,'plain');
  assert.equal(parseLrc('[00:99]Invalid').kind,'plain');
  assert.throws(()=>parseLrc('x'.repeat(2000001)),/limit/);
  assert.equal(JSON.parse(JSON.stringify(plainLyrics('مرحبا\nHello'))).lines[0].endMs,86400000);
});
test('TTML preserves the complete shaped string and explicit word ranges',()=>{
  const lyrics=parseTtml('<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="1s" end="5s"><span begin="0s" dur="1s">مرحبا</span> <span begin="1s" dur="2s">بالعالم</span><br/>Hello 2026</p></div></body></tt>',10000);
  assert.equal(lyrics.kind,'word');const line=lyrics.lines[0]!;
  assert.equal(line.text,'مرحبا بالعالم\nHello 2026');
  assert.deepEqual(line.words!.map(w=>[w.startMs,w.endMs,line.text.slice(w.from,w.to)]),[[1000,2000,'مرحبا'],[2000,4000,'بالعالم']]);
});
test('TTML inherits nested relative timing and supports absolute music exports',()=>{
  const relative=parseTtml('<tt><body begin="1s"><div begin="2s"><p begin="3s" dur="3s"><span begin="1s" dur="1s">夜</span></p></div></body></tt>',20000);
  assert.equal(relative.lines[0]!.startMs,6000);assert.equal(relative.lines[0]!.words![0]!.startMs,7000);
  const absolute=parseTtml('<tt><body><p begin="5s" end="8s"><span begin="5s" end="6s">Hello</span> <span begin="6s" end="8s">world</span></p></body></tt>',10000,true);
  assert.equal(absolute.lines[0]!.words![0]!.startMs,5000);
});
test('TTML time formats respect explicit frame and tick rates',()=>{
  assert.equal(parseTime('01:02:03.250'),3723250);assert.equal(parseTime('00:00:01:15',30),1500);
  assert.equal(parseTime('25f',25),1000);assert.equal(parseTime('100t',25,100),1000);
  const lyrics=parseTtml('<tt xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:frameRate="25" ttp:tickRate="100"><body><p begin="25f" dur="100t">Timed</p></body></tt>',10000);
  assert.equal(lyrics.lines[0]!.startMs,1000);assert.equal(lyrics.lines[0]!.endMs,2000);
});
test('TTML rejects hostile XML, unsupported timing and overlapping voices',()=>{
  for(const input of ['<!DOCTYPE tt [<!ENTITY x SYSTEM "file:///secret">]><tt>&x;</tt>','<html/>','<tt><body timeContainer="seq"><p begin="1s" dur="2s">X</p></body></tt>','<tt><body><p begin="1s" end="4s">A</p><p begin="2s" end="5s">B</p></body></tt>','<tt><body><p begin="5s" end="1s">X</p></body></tt>'])assert.throws(()=>parseTtml(input));
});
test('First strong direction handles Arabic, Persian, Urdu, Hebrew, Japanese and mixed digits',()=>{
  for(const text of ['مرحبا بالعالم','۲۰۲۶ فارسی','123 اردو','! שלום'])assert.equal(directionOf(text),'rtl');
  for(const text of ['2026 Hello','音楽とともに','한국어','中文','Hello مرحبا'])assert.equal(directionOf(text),'ltr');
  assert.equal(directionOf('مرحبا English 123'),'rtl');assert.equal(directionOf('مرحبا','ltr'),'ltr');
  assert.equal(graphemes('a\u0301👨‍👩‍👧‍👦').length,2);
});
test('Matching retains version and requires title, artist, album and duration',()=>{
  assert.ok(matches(track,record));
  for(const change of [{trackName:'Night'},{trackName:'Night (Remix)'},{artistName:'Other'},{albumName:'Studio'},{duration:190}])assert.equal(matches(track,{...record,...change}),false);
  assert.ok(matches(track,{...record,trackName:'NIGHT（Live）',duration:181.9}));
});
test('Provider uses documented endpoint, validates response and falls back to strict search',async()=>{
  const urls:string[]=[];
  const mock:typeof fetch=async input=>{urls.push(String(input));return Response.json(urls.length===1?{...record,trackName:'Wrong song'}:[{...record,trackName:'Night'},{...record}]);};
  const found=await new LrclibProvider(mock).find(track,new AbortController().signal);
  assert.equal(found?.kind,'synced');assert.match(urls[0]!,/^https:\/\/lrclib.net\/api\/get\?/);assert.match(urls[1]!,/\/api\/search\?/);
});
test('Provider supports plain/instrumental and rejects incorrect metadata',async()=>{
  const find=(data:unknown)=>new LrclibProvider(async()=>Response.json(data)).find(track,new AbortController().signal);
  assert.equal((await find({...record,syncedLyrics:null,plainLyrics:'Words only'}))?.kind,'plain');
  assert.equal((await find({...record,instrumental:true}))?.kind,'instrumental');
  assert.equal(await find({...record,artistName:'Someone else'}),null);
});
test('Playback clock freezes on pause, clamps ending, and recovers backward seeks',()=>{
  const clock=new PlaybackClock(),base:Playback={type:'playback',protocol:1,seq:1,revision:'one',track,positionMs:1000,playing:true};
  clock.update(base,500);assert.equal(clock.position(1500),2000);
  clock.update({...base,playing:false,positionMs:2500},1500);assert.equal(clock.position(9999),2500);
  clock.update({...base,positionMs:500},2000);assert.equal(clock.position(2200),700);assert.equal(clock.position(999999),180000);
  clock.update(null,0);assert.equal(clock.position(1000),0);
});
test('Cue search handles pre-roll, gaps, end boundaries and backward seek',()=>{
  const lines=[{startMs:1000,endMs:2000,text:'A'},{startMs:3000,endMs:4000,text:'B'}];
  assert.deepEqual([0,1000,2000,2500,3000,4000,1500].map(p=>lineAt(lines,p)),[-1,0,-1,-1,1,-1,0]);
});
test('Runtime schemas reject malformed snapshots and unsafe appearance input',()=>{
  assert.equal(playbackSchema.safeParse({type:'playback',protocol:1,positionMs:NaN}).success,false);
  for(const input of [{width:1},{color:'url(http://evil)'},{offsetMs:999999},{opacity:4}])assert.equal(settingsSchema.safeParse({...defaults,...input}).success,false);
});
