import { ModelViewer, thumbnail, resetThumbnails } from './viewer.js';
import { marked } from './vendor/marked/lib/marked.esm.js';
import DOMPurify from './vendor/dompurify/dist/purify.es.mjs';
import { readJson, sourceUrl, localFilesOnly, connectionState } from './data-source.js';
import { createComparison } from './target-comparison.js';

const $=id=>document.getElementById(id);
const categories={
  maps:['마을과 세계','MAPS','원작의 공간을 열고, 배치와 제작 자료를 함께 살펴보세요.','M3 19l6-3 6 3 6-3V5l-6 3-6-3-6 3zm6-14v11m6-8v11'],
  models:['건물과 소품','MODELS','원본 모델의 형태와 사용된 맵을 확인하세요.','M3 10l9-7 9 7v11H3zm6 11v-7h6v7'],
  terrain:['지형과 높이','TERRAIN','지형, 높이, 텍스처와 원본 격자를 함께 살펴보세요.','M2 20L9 5l4 8 3-5 6 12zm5-11l2 2 2-2'],
  portraits:['캐릭터와 표정','PORTRAITS','원작 초상과 새 표정 원화를 나란히 비교하세요.','M16 7a4 4 0 11-8 0 4 4 0 018 0M4 21v-3a8 8 0 0116 0v3'],
  actors:['3D 액터','3D ACTORS','원작 3D 캐릭터의 초기 자세와 전체 프레임 자료입니다.','M12 2l9 5v10l-9 5-9-5V7zm0 10v10m-9-15l9 5 9-5'],
  sprites:['스프라이트','SPRITES','캐릭터, 몬스터, 이펙트와 UI의 이미지 프레임을 탐색하세요.','M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z'],
  art:['원화 비교','CONCEPT ART','같은 인물을 새롭게 해석한 원작과 리메이크 원화입니다.','M3 4h18v16H3zm0 12l6-6 5 5 3-3 4 4M16 7h1'],
  docs:['개발 자료','DEVELOPMENT','장별 흐름, 이벤트, 데이터와 재현 근거를 읽어보세요.','M4 3h12l4 4v14H4zm11 0v5h5M8 12h8M8 16h8'],
  work:['작업 한눈에','WORK IN PROGRESS','원화, 배역, 모델과 제작 과정을 한곳에서 비교합니다.','M4 4h16v16H4zm4 4h8M8 12h8M8 16h5'],
  worlds:['월드·마을 원화','WORLD TARGETS','기억 속 마을을 다시 그린 방향과 버전별 목표 원화입니다.','M3 19l6-3 6 3 6-3V5l-6 3-6-3-6 3zm6-14v11m6-8v11'],
  rooms:['실내·건축 원화','ROOM CONCEPTS','원작 공간, 조립 중간본, 새 목표 원화를 구분해 비교합니다.','M3 10l9-7 9 7v11H3zm6 11v-7h6v7'],
  stages:['TA 제작 과정','PRODUCTION STAGES','원화 선택 · High/Low · UV · 베이크 · PBR · Unity의 실제 제작 기록입니다.','M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z'],
  crafted:['리메이크 모델','REMADE ASSETS','제작된 부품을 원본과 비교하고 실제 모델·편집 소스를 확인하세요.','M12 2l9 5v10l-9 5-9-5V7zm0 10v10m-9-15l9 5 9-5'],
  buildings:['건물 원화 비교','ENVIRONMENT / TARGET ART','건물의 앞뒤를 함께 보며 원작에서 목표 원화로 달라진 형태와 재질을 살펴보세요.','M3 10l9-7 9 7v11H3zm6 11v-7h6v7'],
  expressions:['표정 리메이크','EXPRESSION ART','원작의 감정을 새 원화로 이어가는 34종의 비교입니다.','M16 7a4 4 0 11-8 0 4 4 0 018 0M4 21v-3a8 8 0 0116 0v3'],
  terrainwork:['지형·길 제작','TERRAIN WORK','Heightmap · Splatmap · 도로 배치와 엔진 검토 기록을 살펴보세요.','M2 20L9 5l4 8 3-5 6 12zm5-11l2 2 2-2'],
  records:['개발·제작 일지','WORK RECORDS','당시 상태와 실제 검증 범위를 날짜별로 남긴 기록입니다.','M4 3h12l4 4v14H4zm11 0v5h5M8 12h8M8 16h8'],
  characterwork:['캐릭터 3D 제작','CHARACTER PRODUCTION','HQ/SQ 버전별 원화·중간 모델·편집 소스와 납품 파일을 확인하세요.','M16 7a4 4 0 11-8 0 4 4 0 018 0M4 21v-3a8 8 0 0116 0v3']
};
const collections={original:['maps','models','terrain','portraits','actors','sprites','docs'],remake:['work','worlds','rooms','stages','crafted','art','expressions','characterwork','terrainwork','buildings','records']};
const statusNames={active:'진행 중 · 기록 기준',verified:'단계 검증 완료',concept:'원화 제작',review:'검토·후속 작업',archive:'이전 작업 기록'};
const icon=(path,cls='')=>`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
let catalog=[],byId=new Map(),counts={},state={collection:'remake',category:'work',status:'',q:'',group:'',chapter:'',page:1,item:''};
let current=null,requestToken=0,filterTimer,observer;
const perPage=36;
const detailsCache=new Map();
function fetchItem(id){
  if(!detailsCache.has(id))detailsCache.set(id,readJson('/api/item/'+id).catch(error=>{detailsCache.delete(id);throw error;}));
  return detailsCache.get(id);
}
function clearLinked(){
  $('linked-board').hidden=true;
  $('linked-board').replaceChildren();
}
function mediaFigure(file,caption){
  const label=escape(caption||file.caption||file.name);
  return `<figure><a href="${escape(file.url)}" target="_blank" rel="noopener"><img loading="lazy" decoding="async" crossorigin="anonymous" src="${escape(file.url)}" alt="${label}"></a><figcaption>${label}</figcaption></figure>`;
}
function reviewCard(row){
  const card=document.createElement('article');
  card.className='review-card';card.dataset.id=row.id;
  const url='#'+new URLSearchParams({collection:row.collection,category:row.kind,item:row.id});
  card.innerHTML=`<header><small>${escape(row.group||categories[row.kind][0])}${row.status?' · '+escape(statusNames[row.status]||row.status):''}</small><h3>${escape(row.title)}</h3></header><div class="review-media" aria-busy="true"></div><p class="review-summary">${escape(row.subtitle)}</p><a class="review-source" href="${url}" target="_blank" rel="noopener">상세·원본 파일 ↗</a>`;
  observer.observe(card);
  return card;
}
async function fillReview(card){
  const media=card.querySelector('.review-media');
  try{
    const item=await fetchItem(card.dataset.id);
    if(!card.isConnected)return;
    const pics=item.images?.length?item.images:item.image?[item.image]:[];
    const summary=card.querySelector('.review-summary');
    summary.textContent=item.summary||item.subtitle;
    if(item.key.startsWith('npc-casting/')&&pics.length>1){
      const [first,target,...others]=pics;
      card.classList.add('casting-card');
      const originals=[first,...others];
      const roleName=file=>file.caption.replace(/^원작\s*·\s*/,'');
      media.innerHTML=`<div class="casting-originals casting-lead"><h4>원작 NPC</h4>${mediaFigure(first,roleName(first))}</div><div class="casting-target"><h4>대체 후보 원화</h4>${mediaFigure(target,item.key.split('/').at(-1))}</div>`;
      if(others.length){
        const strip=document.createElement('div');strip.className='casting-originals casting-alternates';
        strip.innerHTML=`<h4>같은 모델을 쓸 배역 · ${others.length}</h4><div>${others.map(file=>mediaFigure(file,roleName(file))).join('')}</div>`;
        media.append(strip);
      }
      const fit=document.createElement('details');fit.className='review-fit';
      fit.innerHTML='<summary>배역별 배색·제작 메모</summary>'+item.notes.filter(note=>!note.startsWith('RGBA 설계안')).map(note=>`<p>${escape(note)}</p>`).join('');
      summary.after(fit);
    }else{
      media.innerHTML=pics.map(f=>mediaFigure(f,f.caption||item.title)).join('');
      if(!pics.length&&item.model){
        const label=document.createElement('small');label.textContent=item.model.format.toUpperCase()+' 모델 · 등록된 이미지 없음';media.append(label);
      }
    }
    media.hidden=!media.childElementCount;
  }catch{if(card.isConnected)media.textContent='미리보기를 읽지 못했습니다. 상세에서 다시 확인하세요.';}
  media.setAttribute('aria-busy','false');
}
function reviewGroup(title,rows,parent){
  const section=document.createElement('section');section.className='review-section';
  const heading=document.createElement('h2');heading.textContent=title+' · '+rows.length;
  const grid=document.createElement('div');grid.className='review-grid';grid.append(...rows.map(reviewCard));
  section.append(heading,grid);parent.append(section);
}
function showLinked(item,rows){
  const board=$('linked-board');board.replaceChildren();
  const title=document.createElement('h2');title.textContent=item.title;board.append(title);
  const desc=document.createElement('p');desc.textContent=item.summary||item.subtitle;board.append(desc);
  if(item.key==='npc-casting-4head'){
    const legend=document.createElement('p');legend.textContent='배색 계획 · R 머리 / G 주 의상 / B 피부 / A 보조 부위';board.append(legend);
  }
  for(const group of new Set(rows.map(row=>row.group))){
    reviewGroup(group||'연결 자료',rows.filter(row=>row.group===group),board);
  }
  board.hidden=false;
}
const viewer=new ModelViewer($('preview'),message=>$('preview-status').textContent=message);
let gallery,homeGallery;
function buildingView(offline=false){
  clearLinked();homeGallery?.clear();homeGallery=null;
  const buildings=state.category==='buildings',compare=buildings&&state.view!=='materials';
  $('building-views').hidden=!buildings;$('building-gallery').hidden=!compare;
  document.querySelector('.inspect').hidden=compare;document.querySelector('.browse').hidden=compare;
  document.querySelector('.searchbox').hidden=compare;
  $('target-view').setAttribute('aria-current',compare?'page':'false');
  $('materials-view').setAttribute('aria-current',buildings&&!compare?'page':'false');
  if(!compare)return false;
  $('title').textContent='원작에서, 새로운 풍경으로.';$('total').textContent='';
  requestToken++;observer?.disconnect();viewer.clear();current=null;
  gallery??=createComparison($('building-gallery'),{onChoose:(set,cell)=>{
    const params=new URLSearchParams(location.hash.slice(1));params.set('set',set);params.set('cell',cell);
    history.replaceState(null,'','#'+params);
  }});
  const p=new URLSearchParams(location.hash.slice(1));
  if(offline)gallery.clear();else gallery.show(p.get('set')||'ragnie-buildings',p.get('cell'));
  return true;
}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const size=n=>n>1048576?(n/1048576).toFixed(1)+' MB':n>1024?Math.ceil(n/1024)+' KB':n+' B';
function urlState(replace=false){
  const p=new URLSearchParams();for(const key of ['collection','category','view','item','q','group','chapter','status'])if(state[key])p.set(key,state[key]);if(state.page>1)p.set('page',state.page);
  const hash='#'+p.toString();if(replace)history.replaceState(null,'',hash);else if(location.hash!==hash)location.hash=hash;
}
function readRoute(){const p=new URLSearchParams(location.hash.slice(1));if(p.has('document')){state={collection:'original',category:'docs',status:'',q:'',group:'',chapter:'',page:1,item:''};renderCategory();return openDocument(p.get('document'));}
  const requested=p.get('category'),collection=collections.remake.includes(requested)?'remake':collections.original.includes(requested)?'original':p.get('collection')==='original'?'original':'remake';
  const category=collections[collection].includes(requested)?requested:collections[collection][0];
  const legacy=category==='buildings'&&(p.get('view')==='materials'||['item','q','status','group','page'].some(key=>p.get(key)));
  state={collection,category,view:legacy?'materials':'',status:p.get('status')||'',q:p.get('q')||'',group:p.get('group')||'',chapter:p.get('chapter')||'',page:Math.max(1,Number(p.get('page'))||1),item:p.get('item')||''};renderCategory();
  const saved=history.state?.browse;
  if(!state.item&&saved?.hash===location.hash){
    requestAnimationFrame(()=>{if(location.hash===saved.hash)window.scrollTo(0,saved.y);});
  }
}
function makeNavigation(){
  $('categories').innerHTML=collections[state.collection].map(key=>{const c=categories[key];return `<button class="nav-button" data-category="${key}" aria-current="${key===state.category?'page':'false'}">${icon(c[3],'nav-icon')}<span>${c[0]}</span>${key==='buildings'?'':`<span class="count">${(counts[key]||0).toLocaleString()}</span>`}</button>`;}).join('');
  $('categories').querySelectorAll('button').forEach(button=>button.onclick=()=>{state={collection:state.collection,category:button.dataset.category,status:'',q:'',group:'',chapter:'',page:1,item:''};urlState();});
  document.querySelectorAll('[data-collection]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.collection===state.collection)));
}
function filtered(){const words=state.q.toLowerCase().trim().split(/\s+/).filter(Boolean);const rows=catalog.filter(x=>x.collection===state.collection&&(state.category==='work'&&!state.item||x.kind===state.category)&&(!state.group||x.group===state.group)&&(!state.chapter||x.chapters.includes(state.chapter))&&(!state.status||x.status===state.status)&&words.every(w=>x.search.includes(w)));return state.collection==='remake'?rows.sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title,'ko')):rows;}
function renderCategory(){
  makeNavigation();const c=categories[state.category];$('title').textContent=c[0];$('breadcrumb').textContent='ARCHIVE / '+c[1];$('description').textContent=c[2];$('total').textContent=(counts[state.category]||0).toLocaleString()+'개 자료';
  if(buildingView(!catalog.length))return;
  if(state.category==='buildings'){$('title').textContent='이전 재질 기록';$('description').textContent='원작 건물에 새 재질을 적용해 보았던 초기 작업입니다.';}
  $('search').value=state.q;$('chapter').value=state.chapter;$('status-filter').value=state.status;
  for(const id of ['status-filter','status-label'])$(id).hidden=state.collection!=='remake';for(const id of ['chapter','chapter-label'])$(id).hidden=state.collection==='remake';
  const groups=[...new Set(catalog.filter(x=>x.collection===state.collection&&(state.category==='work'&&!state.item||x.kind===state.category)).map(x=>x.group).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  $('group').replaceChildren(new Option('전체',''),...groups.map(g=>new Option(g,g)));$('group').value=state.group;
  $('chapter').disabled=!['maps','models','terrain'].includes(state.category);
  $('browse-title').textContent=$('title').textContent+' 둘러보기';renderCards();
  const selected=byId.get(state.item);
  document.querySelector('.inspect').hidden=!selected;
  if(selected?.kind===state.category)selectItem(selected.id,false);
  else {requestToken++;viewer.clear();current=null;}
}
function renderCards(){
  observer?.disconnect();resetThumbnails();homeGallery?.clear();homeGallery=null;
  const allWork=state.category==='work'&&!state.item;
  const list=filtered();
  const remake=state.collection==='remake',cards=$('cards'),pager=$('more-results').parentElement;
  cards.replaceChildren();cards.classList.toggle('review-list',remake);
  pager.hidden=true;
  $('result-count').textContent=`${list.length.toLocaleString()}개 결과`;
  if(allWork){$('total').textContent=list.length+'개 자료';$('browse-title').textContent='전체 리메이크 작업';}
  let end=0;
  observer=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(!entry.isIntersecting)continue;
      const el=entry.target;observer.unobserve(el);
      if(el===pager){appendOriginal();continue;}
      if(el.matches('.review-card')){fillReview(el);continue;}
      const row=byId.get(el.dataset.id);
      const sprite=el.querySelector('canvas');
      if(sprite)drawSprite(sprite,row.image.url,row.crop);
      const img=el.querySelector('img[data-file]');if(img)thumbnail(row.model,img);
    }
  },{rootMargin:'260px'});
  if(!list.length){cards.innerHTML='<p class="empty">일치하는 자료가 없습니다.</p>';return;}
  if(remake){
    const groups=allWork?collections.remake.filter(kind=>list.some(r=>r.kind===kind)):[...new Set(list.map(r=>r.group))];
    for(const group of groups){
      const rows=list.filter(row=>(allWork?row.kind:row.group)===group);
      if(allWork&&group==='buildings'&&!state.q&&!state.group&&!state.status){
        const section=document.createElement('section');section.className='review-section';
        const title=document.createElement('h2');title.textContent='마을 건물 · 원작과 목표 원화';
        const galleryRoot=document.createElement('div');section.append(title,galleryRoot);cards.append(section);
        homeGallery=createComparison(galleryRoot,{onChoose:()=>{}});
        homeGallery.show('ragnie-buildings');
      }
      reviewGroup(allWork&&group==='buildings'?'건물 재질 연구':allWork?categories[group][0]:group||categories[state.category][0],rows,cards);
    }
    return;
  }
  function appendOriginal(){
    const saved=history.state?.browse;
    const restoreCount=!state.item&&saved?.hash===location.hash?saved.count:0;
    const limit=Math.min(list.length,Math.max(state.page*perPage,end+perPage,restoreCount));
    for(const row of list.slice(end,limit))appendCard(row);
    end=limit;pager.hidden=end>=list.length;
    if(!pager.hidden)observer.observe(pager);
  }
  $('more-results').onclick=appendOriginal;
  appendOriginal();
  function appendCard(row){
    const button=document.createElement('button');button.className='card';button.dataset.id=row.id;button.dataset.kind=row.kind;button.setAttribute('aria-pressed',String(row.id===state.item));
    const media=document.createElement('span');media.className='card-media';media.innerHTML=icon(categories[row.kind][3],'placeholder');
    if(row.image){
      if(row.crop){const canvas=document.createElement('canvas');canvas.width=240;canvas.height=180;canvas.setAttribute('aria-label',row.title+' 원본 프레임');media.replaceChildren(canvas);button.dataset.thumbnail="true";}
      else{const image=document.createElement('img');image.crossOrigin='anonymous';image.src=row.image.url;image.alt=row.title;image.loading='lazy';image.onerror=()=>{media.replaceChildren();};media.replaceChildren(image);}
    } else if(row.model){const image=document.createElement('img');image.alt=row.title+' 3D 미리보기';image.dataset.file=row.model.id;image.hidden=true;image.onload=()=>{image.hidden=false;media.querySelector('svg')?.remove();};media.append(image);button.dataset.thumbnail='true';}
    if(row.model){const tag=document.createElement('span');tag.className='tag';tag.textContent='3D';media.append(tag);}
    const info=document.createElement('span');info.className='card-info';info.innerHTML=`${row.status?`<span class="work-meta"><span class="status-dot ${row.status}">${escape(statusNames[row.status])}</span><time>${escape(row.date)}</time></span>`:''}<strong>${escape(row.title)}</strong><small>${escape(row.subtitle)}</small>`;
    button.append(media,info);button.onclick=()=>{
      history.replaceState({browse:{hash:location.hash,count:cards.childElementCount,y:window.scrollY}},'');
      state.item=row.id;urlState();$('main').scrollIntoView({block:'start'});
    };cards.append(button);if(button.dataset.thumbnail)observer.observe(button);
  }

}
async function drawSprite(canvas,url,rect){
  const drawToken=String(Number(canvas.dataset.drawToken||0)+1);canvas.dataset.drawToken=drawToken;
  const image=new Image();image.crossOrigin='anonymous';image.src=url;
  try{await image.decode();if(!canvas.isConnected||canvas.dataset.drawToken!==drawToken)return;const context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);context.imageSmoothingEnabled=false;const [x,y,w,h]=rect;if(!w||!h)return;const scale=Math.min((canvas.width-16)/w,(canvas.height-16)/h);const dw=w*scale,dh=h*scale;context.drawImage(image,x,y,w,h,(canvas.width-dw)/2,(canvas.height-dh)/2,dw,dh);}catch{canvas.setAttribute('aria-label','원본 프레임을 읽을 수 없습니다.');}
}
async function selectItem(id,updateRoute=true){
  const token=++requestToken;state.item=id;if(updateRoute)urlState(true);
  document.querySelector('.inspect').hidden=false;clearLinked();
  $('cards').querySelectorAll('.card').forEach(c=>c.setAttribute('aria-pressed',String(c.dataset.id===id)));
  try{const item=await fetchItem(id);if(token!==requestToken)return;
    current=item;showDetails(item);if(updateRoute)$('main').scrollIntoView({block:'start',behavior:'instant'});$('preview-label').textContent=item.key;$('preview-caption').textContent=item.model?'드래그로 회전 · 휠로 확대':'보존된 실제 자료';$('preview-status').textContent='';$('media-controls').hidden=true;$('asset-views').hidden=true;$('full-image').hidden=true;$('preview').className='preview';
    $('viewer-controls').hidden=!item.model;
    if(item.document){viewer.clear();await renderDocument(item.document.id,token);}
    else if(item.collection==='remake'&&(item.image||item.images.length)){showRemakeMedia(item);}
    else if(item.model){$('orbit').setAttribute('aria-pressed','true');$('top').setAttribute('aria-pressed','false');await viewer.load(item.model);}
    else if(item.spriteMetadata){viewer.clear();await renderSprite(item,token);}
    else{viewer.clear();if(item.images.length>1)showImages(item.images);else if(item.image)showImages([item.image]);else $('preview').innerHTML='<p class="empty">이 항목은 원문과 구조 자료를 제공합니다.<br>오른쪽 관련 파일에서 확인하세요.</p>';}
  }catch(e){if(token!==requestToken)return;$('preview-status').textContent='자료를 읽지 못했습니다.';console.error(e);}
}
function showDetails(item){
  $('detail-kind').textContent=categories[item.kind]?.[1]||'DOCUMENT';$('detail-title').textContent=item.title;$('detail-subtitle').textContent=item.subtitle;
  $('detail-state').innerHTML=item.status?`<span class="status-dot ${item.status}">${escape(statusNames[item.status])}</span><time>${escape(item.date)}</time>`:'';$('detail-summary').textContent=item.summary!==item.subtitle?item.summary||'':'';
  $('stats').innerHTML=Object.entries(item.stats||{}).filter(([,v])=>v!==null).map(([k,v])=>`<dt>${escape(k)}</dt><dd>${escape(Array.isArray(v)?v.join(' × '):v)}</dd>`).join('');
  $('notes').innerHTML=(item.notes||[]).map(n=>`<p class="note">${escape(n)}</p>`).join('');
  const links=(item.files||[]).map(f=>`<a class="file-link" href="${f.url}?download=1" title="${escape(f.path)}"><b class="format">${escape(f.format)}</b><span>${escape(f.name)}</span><small>${size(f.bytes)} ↓</small></a>`);
  $('files').innerHTML=`<div class="files-title"><span>관련 파일</span><span>${links.length}</span></div>${links.slice(0,5).join('')}${links.length>5?`<details><summary>파일 ${links.length-5}개 더 보기</summary>${links.slice(5).join('')}</details>`:''}`;
  const related=(item.related||[]).map(id=>byId.get(id)).filter(Boolean);
  $('related').innerHTML=(item.targetComparison?`<a class="asset-board-link" href="${item.targetComparison}">Original ↔ Target 비교 ↗</a>`:'')+(item.assetBoard?`<a class="asset-board-link" href="${item.assetBoard}">건물·다리·공원 에셋 목록 ↗</a>`:'');
  if(related.length){
    showLinked(item,related);
    if(item.kind!=='work')document.querySelector('.inspect').after($('linked-board'));
    else document.querySelector('.inspect').before($('linked-board'));
    if(item.kind==='work')document.querySelector('.browse').hidden=true;
  }
  $('copy-reference').hidden=false;$('copy-status').textContent='';
}
function showImages(images){
  if(images.length>1){const pair=document.createElement('div');pair.className='comparison';for(const f of images.slice(0,2)){const figure=document.createElement('figure');const img=document.createElement('img');img.crossOrigin='anonymous';img.onerror=()=>img.hidden=true;img.src=f.url;img.alt=f.caption+' · '+current.title;const caption=document.createElement('figcaption');caption.textContent=f.caption;figure.append(img,caption);pair.append(figure);}$('preview').replaceChildren(pair);}
  else{const img=document.createElement('img');img.className='single-image';img.crossOrigin='anonymous';img.onerror=()=>img.hidden=true;img.src=images[0].url;img.alt=current.title;$('preview').replaceChildren(img);}
}
function showRemakeMedia(item){
  const pictures=item.images.length?item.images:[{...item.image,caption:'결과 이미지'}];
  const views=[...(item.pair&&pictures.length>1?[{id:'pair',label:'원작 / 리메이크'}]:[]),...pictures.map((f,i)=>({id:String(i),label:f.caption})),...(item.model?[{id:'3d',label:'3D 모델'}]:[])];
  $('asset-views').hidden=views.length<2;$('asset-views').innerHTML=views.map(v=>`<button data-view="${v.id}" aria-pressed="false">${escape(v.label)}</button>`).join('');
  const change=async id=>{viewer.clear();$('viewer-controls').hidden=id!=='3d';$('full-image').hidden=id==='3d';$('preview-status').textContent='';
    $('asset-views').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===id)));
    if(id==='3d'){await viewer.load(item.model);$('preview-caption').textContent='드래그로 회전 · 휠로 확대';return;}
    const selected=id==='pair'?pictures.slice(0,2):[pictures[Number(id)]];showImages(selected);$('full-image').href=selected.at(-1).url;$('preview-caption').textContent=selected.map(x=>x.caption).join(' / ');
  };
  $('asset-views').querySelectorAll('button').forEach(b=>b.onclick=()=>change(b.dataset.view));change(views[0].id);
}
async function renderSprite(item,token){
  const response=await fetch(item.spriteMetadata.url);if(!response.ok)throw Error('sprite metadata');const meta=await response.json();if(token!==requestToken)return;
  const canvas=document.createElement('canvas');canvas.width=720;canvas.height=400;canvas.className='frame-canvas';canvas.setAttribute('aria-label',item.title+' 이미지 프레임');$('preview').replaceChildren(canvas);
  const imageRecord=item.image;
  // This corpus has one atlas page per sprite; page coordinates are preserved metadata.
  $('media-controls').hidden=false;$('media-controls').innerHTML=`<label for="sprite-frame">이미지 프레임</label><input id="sprite-frame" type="range" min="0" max="${meta.frames.length-1}" value="0"><output id="frame-index" for="sprite-frame"></output>`;
  const render=()=>{const i=Number($('sprite-frame').value);const f=meta.frames[i];$('frame-index').textContent=`${i+1} / ${meta.frames.length}`;if(f.atlasPage!==0||!imageRecord){$('preview-status').textContent='빈 프레임';canvas.getContext('2d').clearRect(0,0,720,400);return;}drawSprite(canvas,imageRecord.url,f.atlasRect);$('preview-status').textContent=f.blank?'빈 프레임':'원본 이미지';};
  $('sprite-frame').oninput=render;render();$('preview-caption').textContent='이미지 순서 탐색 · ACT 동작 재생 아님';
}
async function renderDocument(id,token){
  $('viewer-controls').hidden=true;$('media-controls').hidden=true;$('asset-views').hidden=true;$('full-image').hidden=true;$('preview').className='preview document-preview';$('preview').innerHTML='<div class="loading-state"><span></span><p>문서를 읽고 있습니다.</p></div>';
  const doc=await readJson('/api/document/'+id);if(token!==requestToken)return;
  const article=document.createElement('article');article.innerHTML=DOMPurify.sanitize(marked.parse(doc.markdown));
  article.querySelectorAll('a').forEach(a=>{const href=a.getAttribute('href');if(href?.startsWith('/files/'))a.href=sourceUrl(href);if(a.href.startsWith('http')&&!a.href.startsWith(location.origin)){a.target='_blank';a.rel='noopener';}});
  $('preview').replaceChildren(article);$('preview-caption').textContent=doc.path;$('preview-status').textContent='원문 연결';
}
async function openDocument(id){
  document.querySelector('.inspect').hidden=false;
  const token=++requestToken;viewer.clear();
  $('preview-label').textContent='개발 자료';$('detail-kind').textContent='DOCUMENT';$('detail-title').textContent='연결된 문서';$('detail-subtitle').textContent='원문과 근거를 따라 읽습니다.';
  for(const name of ['stats','notes','related','detail-state','detail-summary'])$(name).replaceChildren();$('files').innerHTML=`<a class="file-link" href="${sourceUrl('/files/'+encodeURIComponent(id))}?download=1">원문 다운로드 ↓</a>`;
  $('copy-reference').hidden=true;current=null;
  try{await renderDocument(id,token);}catch{$('preview').innerHTML='<p class="error">문서를 읽지 못했습니다. 원문 다운로드를 이용하세요.</p>';}
}
function filtersChanged(){state.q=$('search').value;state.group=$('group').value;state.chapter=state.collection==='original'?$('chapter').value:'';state.status=state.collection==='remake'?$('status-filter').value:'';state.page=1;state.item='';urlState(true);renderCategory();}
$('search').oninput=()=>{clearTimeout(filterTimer);filterTimer=setTimeout(filtersChanged,200);};$('group').onchange=filtersChanged;$('chapter').onchange=filtersChanged;
$('status-filter').onchange=filtersChanged;
document.querySelectorAll('[data-collection]').forEach(b=>b.onclick=()=>{const collection=b.dataset.collection;state={collection,category:collections[collection][0],status:'',q:'',group:'',chapter:'',page:1,item:''};urlState();});
$('clear').onclick=()=>{state.q='';state.group='';state.chapter='';state.status='';state.page=1;state.item='';urlState(true);renderCategory();};
$('orbit').onclick=()=>{viewer.view(false);$('orbit').setAttribute('aria-pressed','true');$('top').setAttribute('aria-pressed','false');};
$('top').onclick=()=>{viewer.view(true);$('top').setAttribute('aria-pressed','true');$('orbit').setAttribute('aria-pressed','false');};$('reset').onclick=()=>viewer.view(false);$('material').onchange=()=>viewer.setMaterial($('material').value);
$('zoom-in').onclick=()=>viewer.zoom(.8);$('zoom-out').onclick=()=>viewer.zoom(1.25);
document.querySelector('.skip').onclick=e=>{e.preventDefault();$('main').focus();};
$('copy-reference').onclick=async()=>{if(!current)return;const text=[current.title,location.href,...current.files.map(f=>f.path)].join('\n');try{await navigator.clipboard.writeText(text);$('copy-status').textContent='자료 링크와 원본 경로를 복사했습니다.';}catch{$('copy-status').textContent='복사를 허용하지 않았습니다. 관련 파일 링크를 이용하세요.';}};
$('guide').onclick=()=>{const row=catalog.find(x=>x.kind==='docs'&&x.key==='README.ko.md');if(!row)return;state={collection:'original',category:'docs',status:'',q:'',group:'',chapter:'',page:1,item:row.id};urlState();};
document.addEventListener('keydown',e=>{if(e.key==='/'&&!document.querySelector('.searchbox').hidden&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();$('search').focus();}});
window.addEventListener('hashchange',readRoute);
async function refreshLibrary(){
  const button=$('refresh-library');button.disabled=true;button.textContent='자료 확인 중…';
  detailsCache.clear();
  try{const data=await readJson('/api/catalog');catalog=data.items;counts=data.counts;byId=new Map(catalog.map(x=>[x.id,x]));current=null;gallery?.clear();readRoute();connectionState(true);
    $('catalog-updated').textContent=new Date(data.updated).toLocaleDateString('ko-KR');$('catalog-updated').dateTime=data.updated;
    document.querySelector('.connection').textContent=data.contributionErrors.length?`기록 ${data.contributionErrors.length}개 확인 필요`:'최신 기록 연결됨';
  }catch(e){requestToken++;catalog=[];counts={};byId.clear();current=null;observer?.disconnect();resetThumbnails();viewer.clear();
    for(const id of ['preview','cards','stats','notes','files','related','detail-state','detail-summary','detail-subtitle','preview-caption','catalog-updated'])$(id).replaceChildren();
    for(const id of ['viewer-controls','media-controls','asset-views','full-image','copy-reference'])$(id).hidden=true;
    if(new URLSearchParams(location.hash.slice(1)).get('category')==='buildings'){readRoute();}else{makeNavigation();buildingView(true);}
    $('total').textContent='';$('result-count').textContent='';$('detail-title').textContent='자료 연결 대기';$('more-results').parentElement.hidden=true;clearLinked();
    document.querySelector('.connection').textContent='자료 연결 없음';$('preview-status').textContent='이 PC의 원본이 연결되면 자료를 표시합니다.';connectionState(false);
  }
  finally{button.disabled=false;button.textContent='자료 새로고침';}
}
$('refresh-library').onclick=refreshLibrary;$('logout').hidden=localFilesOnly||location.hostname!=='remake.genesisframeworks.com';
await refreshLibrary();
