import { readJson, pageUrl, connectionState } from './data-source.js';
const markup=`<nav id="comparison-sets" aria-label="마을 선택"></nav>
<section aria-labelledby="comparison-subject"><div class="comparison-controls"><div><p id="comparison-count" class="eyebrow"></p><h2 id="comparison-subject">원본과 Target을 불러오고 있습니다.</h2></div><div class="comparison-picker"><button id="comparison-prev" aria-label="이전 건물" disabled>←</button><label for="comparison-cell" class="sr">비교할 건물</label><select id="comparison-cell" disabled><option>불러오는 중</option></select><button id="comparison-next" aria-label="다음 건물" disabled>→</button></div></div>
<p id="comparison-status" role="status">참조 이미지를 연결하고 있습니다.</p>
<div id="comparison-pair" class="comparison-pair" aria-busy="true">
<figure><figcaption><div><span class="eyebrow">ORIGINAL</span><strong>원작</strong></div><a id="original-full" hidden target="_blank" rel="noopener">전체 이미지 ↗</a></figcaption><div class="comparison-frame"><img id="original-image" crossorigin="anonymous" alt="원작 건물" hidden></div></figure>
<figure class="comparison-target"><figcaption><div><span class="eyebrow">TARGET</span><strong>목표 원화</strong></div><a id="target-full" hidden target="_blank" rel="noopener">전체 이미지 ↗</a></figcaption><div class="comparison-frame"><img id="target-image" crossorigin="anonymous" alt="Target 건물 원화" hidden></div></figure>
</div><div class="comparison-bottom"><p id="comparison-note"></p><div><a id="comparison-expanded" hidden>비교 크게 보기 ↗</a><a id="comparison-model" hidden>원본 3D 보기 ↗</a><a id="comparison-map" hidden>원작 맵 보기 ↗</a></div></div></section>
<p class="comparison-footnote">Target은 제작 방향을 보여주는 원화입니다. 완성된 3D 모델이나 동일 축척의 도면과는 구분합니다.</p>`;
const images=new Map();
function loadImage(file){
  if(!file)return Promise.reject(Error('Missing file'));
  if(!images.has(file.url))images.set(file.url,new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>{images.delete(file.url);reject(Error('image'));};img.src=file.url;}));
  return images.get(file.url);
}
function crop(img,rect){
  if(!rect)return img.src;
  const [x,y,w,h]=rect,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(img,x,y,w,h,0,0,w,h);return canvas.toDataURL('image/png');
}
// The same gallery is mounted in the archive and on the standalone sheet.
export function createComparison(root,{onChoose,standalone=false}){
  root.innerHTML=markup;
  const $=id=>root.querySelector('#'+id);
  let data,pending,set,cellId='',generation=0,selection=0;
  function select(id,cell){
    chooseSet(id,cell);
    onChoose(set.id,cellId);
  }
  async function render(){
    const token=++generation,cell=set.cells.find(x=>x.id===cellId),index=set.cells.indexOf(cell);
    $('comparison-sets').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.set===set.id)));
    $('comparison-cell').value=cellId;$('comparison-prev').disabled=index<=0;$('comparison-next').disabled=index>=set.cells.length-1;
    $('comparison-count').textContent=set.title+' · '+(cell?`${String(index+1).padStart(2,'0')} / ${set.cells.length}`:(set.sheetLabel||`전체 ${set.cells.length}종`));
    $('comparison-subject').textContent=cell?`${cell.id} · ${cell.title}`:(set.sheetLabel||'전체 시트 비교');
    $('comparison-note').textContent=cell?.note||set.note;$('comparison-map').href=pageUrl('/#collection=original&category=maps&item='+set.mapItemId);$('comparison-map').hidden=false;
    $('comparison-model').hidden=!cell?.modelItemId;if(cell?.modelItemId)$('comparison-model').href=pageUrl('/#collection=original&category=models&item='+cell.modelItemId);
    $('comparison-model').textContent=cell?.components?.length>1?'본체 3D 보기 ↗':'원본 3D 보기 ↗';
    if(standalone){
      const back=document.getElementById('comparison-back');back.href=set.assetBoard||pageUrl('/#collection=original&category=maps&item='+set.mapItemId);back.textContent=set.assetBoard?'도시 에셋 목록으로 ↗':'라그니 원작 맵으로 ↗';
      document.title=set.title+' · Original ↔ Target | Arcturus';
    }else{
      const full=$('comparison-expanded');full.hidden=false;full.href=pageUrl('/target-comparison.html?'+new URLSearchParams({set:set.id,cell:cellId}));
    }
    $('comparison-status').textContent='이미지를 불러오고 있습니다.';$('comparison-pair').setAttribute('aria-busy','true');
    for(const side of ['original','target']){$(side+'-image').hidden=true;$(side+'-full').hidden=true;}
    try{
      const sides=['original','target'];
      const files=sides.map(side=>(cell?.[side]||set[side]).file);
      const loaded=await Promise.allSettled(files.map(loadImage));if(token!==generation)return;
      ['original','target'].forEach((side,i)=>{
        if(loaded[i].status!=='fulfilled')return;
        const img=$(side+'-image');img.src=crop(loaded[i].value,cell?.[side+'Rect']);img.alt=`${set.title} · ${cell?cell.title:'전체 시트'} · ${side==='original'?'Original 원작':'Target 목표 원화'} · 두 방향`;img.hidden=false;
        $(side+'-full').href=files[i].url;$(side+'-full').hidden=false;
      });
      let message='시트입니다. 위에서 건물을 선택하면 크게 비교할 수 있습니다.';
      if(cell)message=cell.angleGuide||'양쪽 패널에서 같은 위치의 컷끼리 비교하세요.';
      if(loaded.some(result=>result.status==='rejected'))message='연결되지 않은 원본은 빈칸으로 표시합니다.';
      $('comparison-status').textContent=message;
    }catch(error){if(token!==generation)return;$('comparison-status').textContent='이미지를 열지 못했습니다. 페이지를 새로고침하거나 자료함에서 원본 연결을 확인하세요.';console.error('Target comparison image unavailable',error);}
    finally{if(token===generation)$('comparison-pair').setAttribute('aria-busy','false');}
  }
  function chooseSet(id,requested){
    set=data.sets.find(x=>x.id===id)||data.sets[0];cellId=requested==='all'?'all':set.cells.some(x=>x.id===requested)?requested:set.cells[0].id;
    if($('comparison-cell').dataset.set!==set.id){
      $('comparison-cell').replaceChildren(new Option(set.sheetLabel||'전체 시트','all'),...set.cells.map(x=>new Option(`${x.id} · ${x.title}`,x.id)));
      $('comparison-cell').dataset.set=set.id;
    }
    $('comparison-cell').disabled=false;render();
  }
  $('comparison-cell').onchange=()=>select(set.id,$('comparison-cell').value);
  $('comparison-prev').onclick=()=>select(set.id,set.cells[set.cells.findIndex(x=>x.id===cellId)-1].id);
  $('comparison-next').onclick=()=>select(set.id,set.cells[set.cells.findIndex(x=>x.id===cellId)+1].id);
  function clear(){
    selection++;generation++;pending=null;data=null;set=null;cellId='';images.clear();
    $('comparison-sets').replaceChildren();$('comparison-count').textContent='';$('comparison-note').textContent='';
    $('comparison-cell').replaceChildren(new Option('연결된 자료 없음',''));delete $('comparison-cell').dataset.set;
    for(const id of ['comparison-cell','comparison-next','comparison-prev'])$(id).disabled=true;
    for(const id of ['original-image','target-image','original-full','target-full','comparison-expanded','comparison-map','comparison-model'])$(id).hidden=true;
    $('comparison-subject').textContent='자료 연결 대기';
    $('comparison-status').textContent='이 PC의 원본이 연결되면 비교 이미지를 표시합니다.';
    $('comparison-pair').setAttribute('aria-busy','false');
  }
  return {clear,async show(id,requested){
    const token=++selection;
    try{
      pending??=readJson('/api/target-comparisons?views=pairs');
      const rows=await pending;if(token!==selection)return;
      if(!data){
        data=rows;
        for(const row of data.sets){
          const b=document.createElement('button');b.dataset.set=row.id;b.textContent=`${row.title} ${row.cells.length}종`;
          b.onclick=()=>select(row.id);$('comparison-sets').append(b);
        }
      }
      chooseSet(id,requested);
      if(standalone)connectionState(true);
    }catch{
      if(token!==selection)return;
      clear();if(standalone)connectionState(false);
    }
  }};
}
const standaloneRoot=document.getElementById('standalone-gallery');
if(standaloneRoot){
  const params=new URLSearchParams(location.search);
  createComparison(standaloneRoot,{standalone:true,onChoose:(set,cell)=>{
    history.replaceState(null,'','?'+new URLSearchParams({set,cell}));
  }}).show(params.get('set'),params.get('cell'));
}
