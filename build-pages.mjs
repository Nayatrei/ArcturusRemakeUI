// Explicit UI allowlist: no catalogs, local paths, source assets or access settings.
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),out=resolve(root,'pages-dist');
const files=['index.html','style.css','icon.svg','app.js','viewer.js','data-source.js','target-comparison.html','target-comparison.js','target-comparison.css','town-assets.html','town-assets.js','town-assets.css'];
await mkdir(out,{recursive:true});
for(const name of files){
  let content=await readFile(resolve(root,'web',name),'utf8');
  if(name.endsWith('.html'))content=content.replace('<head>','<head><meta name="arcturus-local-files" content="true">');
  await writeFile(resolve(out,name),content);
}
for(const pkg of ['three','marked','dompurify']){
  const target=resolve(out,'vendor',pkg);await mkdir(target,{recursive:true});
  for(const part of pkg==='three'?['build','examples/jsm','LICENSE']:pkg==='marked'?['lib','LICENSE']:['dist','LICENSE','LICENSE-MPL'])await cp(resolve(root,'node_modules',pkg,part),resolve(target,part),{recursive:true});
}
await writeFile(resolve(out,'.nojekyll'),'');
console.log('Static UI built in pages-dist. Local assets and catalogs are excluded.');
