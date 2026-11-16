import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { craftedWork } from './web/crafted-work.js';
const element=()=>({dataset:{},setAttribute(){},addEventListener(){},append(){},after(){},querySelector(){return {};}});
globalThis.location=new URL('https://nayatrei.github.io/ArcturusRemakeUI/');
globalThis.document={querySelector:()=>element(),createElement:element,querySelectorAll:()=>[],getElementById:()=>null};
const client=await import('./web/data-source.js');
test('direct local opening keeps the selected subject or map and stays on the companion',()=>{
  assert.equal(client.localViewUrl('https://nayatrei.github.io/ArcturusRemakeUI/target-comparison.html?set=ragnie-buildings&cell=RGN-06'),'http://127.0.0.1:8899/target-comparison.html?set=ragnie-buildings&cell=RGN-06');
  assert.equal(client.localViewUrl('https://remake.genesisframeworks.com/#collection=original&category=maps'),'http://127.0.0.1:8899/#collection=original&category=maps');
  assert.equal(client.localViewUrl('https://example.org/files/unknown'),'http://127.0.0.1:8899/');
});
test('published shell resolves only registered data URLs to loopback',()=>{
  assert.equal(client.sourceUrl('/api/catalog'),'http://127.0.0.1:8899/api/catalog');
  const input={model:{url:'/files/abc'},path:'K:/private/source',note:'local record',link:'/target-comparison.html?set=test'};
  const output=client.connectUrls(input);
  assert.equal(output.model.url,'http://127.0.0.1:8899/files/abc');
  assert.equal(output.path,input.path);assert.equal(input.model.url,'/files/abc');
  assert.ok(output.link.endsWith('/web/target-comparison.html?set=test'));
  assert.equal(client.sourceUrl('https://example.com/file'),'https://example.com/file');
});
test('JSON success maps source URLs without credentials or persistent cache',async()=>{
  globalThis.fetch=async(url,options)=>{assert.equal(url,'http://127.0.0.1:8899/api/catalog');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.ok(options.signal);return {ok:true,status:200,json:async()=>({image:{url:'/files/one'}})};};
  assert.equal((await client.readJson('/api/catalog')).image.url,'http://127.0.0.1:8899/files/one');
});
test('missing source rejects and a later retry can recover',async()=>{
  globalThis.fetch=async()=>{throw new TypeError('Unavailable');};
  await assert.rejects(client.readJson('/api/catalog'));
  globalThis.fetch=async()=>({ok:false,status:404});await assert.rejects(client.readJson('/api/catalog'));
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({ready:true})});assert.deepEqual(await client.readJson('/api/catalog'),{ready:true});
});
test('build allowlist excludes private metadata and login; paths support Pages subfolders',async()=>{
  const build=await readFile('build-pages.mjs','utf8');
  assert.ok(!build.includes("'config.json'"));assert.ok(!build.includes("'login.html'"));assert.ok(!build.includes("'catalog.py'"));
  for(const name of ['index.html','target-comparison.html','town-assets.html']){
    const html=await readFile('web/'+name,'utf8');assert.doesNotMatch(html,/(?:src|href)="\/(?!\/)/);assert.doesNotMatch(html,/":"\/vendor/);
  }
});
test('crafted cards show all directly linked artwork without duplicating their original images',async()=>{
  const item={id:'asset',kind:'crafted',images:[{id:'original'}],related:['art']};
  const work={id:'art',status:'concept',related:['asset'],images:[{id:'original'},...['A','B','C','D'].map(id=>({id,caption:id}))]};
  const byId=new Map([['asset',item],['art',{id:'art',kind:'work',status:'concept'}]]);
  const result=await craftedWork(item,byId,async()=>work);
  assert.deepEqual(result.records[0].images.map(image=>image.id),['A','B','C','D']);
  assert.equal(result.records[0].work.status,'concept');
  assert.equal(work.images.length,5);assert.equal(item.images.length,1);
});
test('shared audits, archived candidates and non-work backlinks do not become an asset target',async()=>{
  const item={id:'asset',kind:'crafted',images:[],related:['audit','archive','model','stale']};
  const byId=new Map([['asset',item],['other',{kind:'crafted'}],['audit',{id:'audit',kind:'work'}],['archive',{id:'archive',kind:'work',status:'archive'}],['model',{id:'model',kind:'models'}],['stale',{id:'stale',kind:'work',status:'concept'}]]);
  const calls=[];
  const result=await craftedWork(item,byId,async id=>{calls.push(id);return {status:id==='stale'?'archive':'review',related:['asset','other'],images:[{id:'image'}]};});
  assert.deepEqual(calls,['audit','stale']);assert.deepEqual(result,{records:[],failed:[]});
});
test('one failed linked record keeps the other artwork visible and reports the missing preview',async()=>{
  const item={id:'asset',kind:'crafted',image:{url:'/original'},related:['missing','ready']};
  const byId=new Map([['asset',item],['missing',{id:'missing',kind:'work',title:'Missing art'}],['ready',{id:'ready',kind:'work'}]]);
  const result=await craftedWork(item,byId,async id=>{if(id==='missing')throw new TypeError('Offline');return {id,related:['asset'],images:[{url:'/original'},{url:'/target'}]};});
  assert.deepEqual(result.failed,['Missing art']);assert.deepEqual(result.records[0].images,[{url:'/target'}]);
});
test('work records are not recursively expanded and the Pages build includes the new UI module',async()=>{
  const result=await craftedWork({kind:'work',related:['source']},new Map(),()=>{throw new Error('Must not fetch');});
  assert.deepEqual(result,{records:[],failed:[]});
  assert.ok((await readFile('build-pages.mjs','utf8')).includes("'crafted-work.js'"));
});
