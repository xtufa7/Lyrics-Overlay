import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {access} from 'node:fs/promises';
const exe=resolve('release/win-unpacked/Spicetify Lyrics Overlay.exe');
await access(exe);
const child=spawn(process.execPath,[resolve('node_modules/tsx/dist/cli.mjs'),'scripts/desktop-smoke.ts'],{stdio:'inherit',env:{...process.env,LYRICS_OVERLAY_EXE:exe}});
child.on('exit',code=>{process.exitCode=code??1;});
