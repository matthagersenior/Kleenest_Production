import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const appRoot=path.join(root,'apps','consumer-mobile');
const source=path.join(appRoot,'assets','app-icon.png');
const res=path.join(appRoot,'android','app','src','main','res');
if(!fs.existsSync(source)||!fs.statSync(source).size)throw new Error('Consumer launcher artwork is missing.');
if(!fs.existsSync(res))throw new Error('Consumer Android resources do not exist; run Expo prebuild first.');
for(const density of ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi']){
 const dir=path.join(res,`mipmap-${density}`);
 fs.mkdirSync(dir,{recursive:true});
 for(const name of fs.readdirSync(dir))if(/^ic_launcher(?:_round|_foreground)?\.(?:png|webp)$/.test(name))fs.rmSync(path.join(dir,name));
 fs.copyFileSync(source,path.join(dir,'ic_launcher.png'));
 fs.copyFileSync(source,path.join(dir,'ic_launcher_round.png'));
}
const adaptive=path.join(res,'mipmap-anydpi-v26');
if(fs.existsSync(adaptive))for(const name of ['ic_launcher.xml','ic_launcher_round.xml']){const file=path.join(adaptive,name);if(fs.existsSync(file))fs.rmSync(file);}
console.log('Applied supplied Kleenest Consumer artwork directly to Android launcher resources.');
