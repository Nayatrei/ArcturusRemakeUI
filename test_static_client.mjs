import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const element=()=>({dataset:{},setAttribute(){},append(){},after(){},querySelector(){return {};}});
globalThis.document={querySelector:()=>element(),createElement:element,querySelectorAll:()=>[],getElementById:()=>null};
const client=await import('./web/data-source.js');
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
