import { build } from 'esbuild';
import { mkdir, copyFile, readdir, writeFile,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

await mkdir('dist/renderer',{recursive:true});await mkdir('dist/extension',{recursive:true});await mkdir('assets',{recursive:true});await mkdir('dist/assets',{recursive:true});
// Small original icon generated from geometric strokes; no remote imagery or asset licensing needed.
const crc32=buffer=>{let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
const chunk=(name,data)=>{const type=Buffer.from(name);const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([len,type,data,crc]);};
function png(size,tray=false){
  const raw=Buffer.alloc(size*(size*4+1));
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const px=x/size,py=y/size;let color=[20,31,25,0];
    if(!tray&&Math.hypot(Math.max(0,Math.abs(px-.5)-.3),Math.max(0,Math.abs(py-.5)-.3))<.18)color=[21,36,27,255];
    for(let j=0;j<3;j++){const line=.35+j*.15+Math.sin((px-.2)*Math.PI*2)*.035;if(px>.2&&px<.8&&Math.abs(py-line)<.016)color=[184,255,213,255];}
    const at=y*(size*4+1)+1+x*4;raw.set(color,at);
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const icon=await readFile('assets/app-icon.png'),ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(icon.length,14);ico.writeUInt32LE(22,18);
await writeFile('assets/icon.ico',Buffer.concat([ico,icon]));await writeFile('dist/assets/tray.png',png(32,true));
await Promise.all([
  build({entryPoints:['src/main/index.ts'],outfile:'dist/main.cjs',bundle:true,platform:'node',format:'cjs',target:'node24',external:['electron'],sourcemap:true}),
  build({entryPoints:['src/main/preload.ts'],outfile:'dist/preload.cjs',bundle:true,platform:'node',format:'cjs',target:'node24',external:['electron']}),
  build({entryPoints:['src/extension/index.ts'],outfile:'dist/extension/lyrics-overlay.js',bundle:true,platform:'browser',format:'iife',target:'chrome120',minify:true,legalComments:'eof'}),
  build({entryPoints:['src/renderer/overlay.ts','src/renderer/settings.ts'],outdir:'dist/renderer',bundle:true,platform:'browser',target:'chrome140',loader:{'.woff2':'file','.woff':'file'},assetNames:'fonts/[name]-[hash]',sourcemap:true})
]);
for(const name of ['settings','overlay'])await copyFile(`src/renderer/${name}.html`,`dist/renderer/${name}.html`);
await copyFile('dist/extension/lyrics-overlay.js','lyrics-overlay.js');
await copyFile('assets/app-icon.png','dist/assets/app-icon.png');
await copyFile('assets/app-icon.png','dist/renderer/app-icon.png');
await copyFile('assets/artwork.png','dist/renderer/artwork.png');
await mkdir('dist/licenses',{recursive:true});
for(const font of ['inter','cairo','noto-sans-jp'])await copyFile(`node_modules/@fontsource/${font}/LICENSE`,`dist/licenses/${font}-OFL.txt`);
await copyFile('LICENSE','dist/licenses/MIT.txt');
for(const [pkg,name] of [['ws','ws'],['zod','zod'],['@xmldom/xmldom','xmldom']])await copyFile(`node_modules/${pkg}/LICENSE`,`dist/licenses/${name}-LICENSE.txt`);
console.log('Built companion, settings, fonts and Spicetify extension.');
