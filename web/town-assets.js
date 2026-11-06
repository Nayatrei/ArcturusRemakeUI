import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { release, materialMode } from './viewer.js';
import { readJson, pageUrl, connectionState } from './data-source.js';

const $=id=>document.getElementById(id),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const loader=new GLTFLoader(),memory=new Map();
let townObserver;
let data,category='all',query='',batchId='',generation=0,abort,renderer,scene,camera;
const map=new URLSearchParams(location.search).get('map')||'dome1';
const route=new URLSearchParams(location.hash.slice(1));category=route.get('group')||'all';query=route.get('q')||'';batchId=route.get('batch')||(location.hash?'':new URLSearchParams(location.search).get('batch'))||'';

function initRenderer(){
  if(renderer)return;
  renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(480,420,false);renderer.setClearColor(0x181818);renderer.outputColorSpace=THREE.SRGBColorSpace;
  scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,10000);
}
function frame(object,direction){
  const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),radius=Math.max(size.length()/2,.01);
  object.position.sub(bounds.getCenter(new THREE.Vector3()));object.updateMatrixWorld(true);
  camera.position.copy(direction.clone().normalize().multiplyScalar(radius*4));camera.lookAt(0,0,0);camera.near=radius/100;camera.far=radius*10;camera.updateMatrixWorld(true);
  let extentX=0,extentY=0;
  for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]){
    const point=new THREE.Vector3(size.x*x,size.y*y,size.z*z).applyMatrix4(camera.matrixWorldInverse);extentX=Math.max(extentX,Math.abs(point.x));extentY=Math.max(extentY,Math.abs(point.y));
  }
  const half=Math.max(extentY,extentX/(480/420),.01)*1.12;camera.left=-half*480/420;camera.right=half*480/420;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
}
function showPictures(card,pictures){
  card.querySelectorAll('.town-view').forEach((figure,i)=>{figure.querySelector('.view-state')?.remove();const img=figure.querySelector('img');img.src=pictures[i];img.hidden=false;});
}
async function renderModels(rows,token){
  let ready=0,failed=0;
  for(const entry of rows){
    if(token!==generation)return;
    const card=document.getElementById(entry.code);let object;
    try{
      if(memory.has(entry.code)){showPictures(card,memory.get(entry.code));ready++;continue;}
      const response=await fetch(entry.model.url,{signal:abort.signal});if(!response.ok)throw Error('source');
      const buffer=await response.arrayBuffer();if(token!==generation)return;
      object=(await loader.parseAsync(buffer,'/')).scene;if(token!==generation)return;
      initRenderer();materialMode(object,'original');scene.add(object);
      const pictures=[];
      for(const direction of [new THREE.Vector3(.9,.8,1.2),new THREE.Vector3(-.9,.8,-1.2)]){
        frame(object,direction);renderer.render(scene,camera);pictures.push(renderer.domElement.toDataURL('image/webp',.92));
      }
      memory.set(entry.code,pictures);showPictures(card,pictures);ready++;
    }catch(error){
      if(token!==generation)return;
      failed++;card.querySelectorAll('.view-state').forEach(x=>x.textContent='이미지 확인 필요 · 3D 원본 보기 이용');
      console.error('Town asset preview failed',entry.code,error);
    }finally{if(object){scene?.remove(object);release(object);}}
    if(token===generation&&batchId)$('town-render-status').textContent=`미리보기 ${ready} / ${rows.length}종${failed?` · 확인 필요 ${failed}종`:''}`;
  }
  if(token===generation&&batchId){$('town-list').setAttribute('aria-busy','false');$('town-render-status').textContent=rows.length?`${ready}종 · 두 방향 미리보기${failed?` · 확인 필요 ${failed}종`:''}`:'';$('town-export').disabled=!batchId||!!query||!!failed||!rows.length;}
}
function render(){
  const token=++generation;townObserver?.disconnect();abort?.abort();abort=new AbortController();
  const batch=data.batches.find(x=>x.id===batchId),pool=batch?batch.codes.map(code=>data.entries.find(x=>x.code===code)):data.entries;
  const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const rows=pool.filter(x=>(batch||category==='all'||x.category===category)&&words.every(w=>[x.title,x.code,x.source,...x.originalNames].join(' ').toLowerCase().includes(w)));
  $('town-groups').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(!batch&&b.dataset.group===category)));
  $('town-batch').value=batchId;$('town-export').disabled=true;$('town-batch-note').textContent=batch?batch.priority+' · '+batch.codes.length+'종 × 두 방향':'';
  const downloads=batch?batch.downloads:data.downloads;
  $('town-downloads').innerHTML=downloads.map(x=>`<a href="${x.url}?download=1">${x.format==='csv'?'목록 CSV':x.format==='png'?'전달용 이미지':x.format==='json'?'배치 근거 JSON':'읽기용 목록'} ↓</a>`).join('');
  $('town-result').textContent=`${rows.length}종 · 원작 배치 ${rows.reduce((s,x)=>s+x.count,0).toLocaleString()}개`;
  $('town-list').setAttribute('aria-busy',String(rows.length>0));$('town-render-status').textContent=rows.length?'두 방향 미리보기를 준비하고 있습니다.':'';
  $('town-list').innerHTML=rows.map(x=>`<article class="town-asset" id="${x.code}"><div class="town-views">${['외관 A','반대편 B'].map(view=>`<figure class="town-view"><img hidden alt="${escape(x.title)} · ${view}"><span class="view-state">3D 원본 읽는 중</span><figcaption>${view}</figcaption></figure>`).join('')}</div><div class="town-asset-meta"><div class="town-asset-top"><div><span class="town-code">${x.code}</span><h2>${escape(x.title)}</h2></div><span class="town-count">배치 ${x.count}개</span></div><p class="town-source">${escape(x.source)}</p><div class="town-asset-actions"><a href="./#collection=original&category=models&item=${x.itemId}" target="_blank" rel="noopener">3D 원본 보기 ↗</a><a href="${x.model.url}?download=1">GLB ↓</a><a href="${x.sourceFile.url}?download=1">RSM ↓</a></div><details><summary>원본 이름·제작 참고</summary><p>${escape(x.originalNames.join(' / '))}</p><p>${x.triangles.toLocaleString()} triangles${x.note?' · '+escape(x.note):''}</p></details></div></article>`).join('')||'<div class="empty"><h2>일치하는 에셋이 없습니다.</h2><p>검색어나 분류를 바꾸거나 초기화를 눌러보세요.</p></div>';
  history.replaceState(null,'','#'+new URLSearchParams({...batch?{batch:batchId}:{group:category},...(query?{q:query}:{})}));
  if(batch){renderModels(rows,token);return;}
  $('town-list').setAttribute('aria-busy','false');
  $('town-render-status').textContent=rows.length?'화면에 들어오는 에셋부터 두 방향을 표시합니다.':'';
  let pending=Promise.resolve();
  const byCode=new Map(rows.map(row=>[row.code,row]));
  townObserver=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(!entry.isIntersecting)continue;
      const card=entry.target;townObserver.unobserve(card);
      pending=pending.then(()=>renderModels([byCode.get(card.id)],token));
    }
  },{rootMargin:'200px'});
  for(const card of $('town-list').children)if(byCode.has(card.id))townObserver.observe(card);
}
async function exportBatch(){
  const batch=data.batches.find(x=>x.id===batchId);if(!batch||!batch.codes.every(x=>memory.has(x)))return;
  $('town-export').disabled=true;
  try{
    const width=3904,cellW=960,cellH=500,pad=32,head=144,canvas=document.createElement('canvas');canvas.width=width;canvas.height=head+Math.ceil(batch.codes.length/4)*cellH+pad;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#181818';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#d8bd80';ctx.font='bold 36px "Malgun Gothic",sans-serif';ctx.fillText(`DOME 1 / ${batch.id} / ${batch.title} / ${batch.codes.length} models`,pad,54);
    ctx.fillStyle='#bbb7ad';ctx.font='24px "Malgun Gothic",sans-serif';ctx.fillText('ORIGINAL REFERENCE · A / opposite B · per-model framing, not a shared scale',pad,100);
    for(let i=0;i<batch.codes.length;i++){
      const code=batch.codes[i],entry=data.entries.find(x=>x.code===code),x=pad+(i%4)*cellW,y=head+Math.floor(i/4)*cellH;
      for(let side=0;side<2;side++){const img=new Image();img.src=memory.get(code)[side];await img.decode();ctx.drawImage(img,x+side*480,y,480,420);}
      ctx.fillStyle='#e8e2d5';ctx.font='bold 24px "Malgun Gothic",sans-serif';ctx.fillText(`${code} · ${entry.title}`,x+12,y+448,936);ctx.fillStyle='#aaa69e';ctx.font='20px "Malgun Gothic",sans-serif';ctx.fillText(entry.source,x+12,y+479,936);
      ctx.strokeStyle='#44413a';ctx.strokeRect(x,y,cellW,cellH);
    }
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${map}-batch-${batch.id}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }finally{$('town-export').disabled=!!query||!data.batches.find(x=>x.id===batchId)?.codes.every(code=>memory.has(code));}
}
try{
  data=await readJson('/api/town/'+encodeURIComponent(map));connectionState(true);
    if(!data.batches.some(x=>x.id===batchId))batchId='';
    if(!data.groups.some(x=>x.id===category)&&category!=='all')category='all';
    $('town-title').textContent=data.title;document.title=data.title+' | Arcturus';
    $('town-totals').innerHTML=`<div><strong>${data.originalModelCount}</strong><span>고유 모델</span></div><div><strong>${data.placementCount.toLocaleString()}</strong><span>원작 배치</span></div>`;
    $('map-link').href=pageUrl('/#collection=original&category=maps&item='+data.mapItemId);
    if(data.targetComparison){$('town-target').href=data.targetComparison;$('town-target').hidden=false;}
    $('town-groups').innerHTML=[...data.groups,{id:'all',label:'전체',models:data.entries.length}].map(x=>`<button data-group="${x.id}" aria-pressed="false">${escape(x.label)}<small>${x.models}</small></button>`).join('');
    $('town-groups').querySelectorAll('button').forEach(b=>b.onclick=()=>{batchId='';category=b.dataset.group;render();});
    $('town-batch').innerHTML='<option value="">분류별 탐색</option>'+data.batches.map(x=>`<option value="${x.id}">${x.id} · ${escape(x.title)} · ${x.codes.length}종</option>`).join('');
    $('town-batch').onchange=()=>{batchId=$('town-batch').value;query='';$('town-search').value='';render();};$('town-export').onclick=exportBatch;
    $('town-notes').innerHTML=data.notes.map(x=>'<li>'+escape(x)+'</li>').join('');
    $('town-search').value=query;let timer;$('town-search').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{query=$('town-search').value;render();},200);};
    $('town-reset').onclick=()=>{batchId='';category='all';query='';$('town-search').value='';render();};
    render();
}catch(error){connectionState(false);$('town-list').setAttribute('aria-busy','false');$('town-list').replaceChildren();$('town-render-status').textContent='이 PC의 원본이 연결되면 도시 에셋을 표시합니다.';}
window.addEventListener('pagehide',()=>{abort?.abort();renderer?.dispose();renderer?.forceContextLoss();});
