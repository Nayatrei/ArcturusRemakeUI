import { readJson, pageUrl, connectionState } from './data-source.js';
const $=id=>document.getElementById(id);
let data,set,cellId='',generation=0;
const images=new Map(),params=new URLSearchParams(location.search);
function loadImage(file){
  if(!file)return Promise.reject(Error('Missing file'));
  if(!images.has(file.url))images.set(file.url,new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>{images.delete(file.url);reject(Error('image'));};img.src=file.url;}));
  return images.get(file.url);
}
function crop(img,rect){
  if(!rect)return img.src;
  const [x,y,w,h]=rect,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(img,x,y,w,h,0,0,w,h);return canvas.toDataURL('image/png');
}
async function render(){
  const token=++generation,cell=set.cells.find(x=>x.id===cellId),index=set.cells.indexOf(cell);
  $('comparison-sets').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.set===set.id)));
  $('comparison-cell').value=cellId;$('comparison-prev').disabled=index<=0;$('comparison-next').disabled=index>=set.cells.length-1;
  $('comparison-count').textContent=set.title+' · '+(cell?`${String(index+1).padStart(2,'0')} / ${set.cells.length}`:`전체 ${set.cells.length}종`);
  $('comparison-subject').textContent=cell?`${cell.id} · ${cell.title}`:'전체 시트 비교';
  $('comparison-note').textContent=set.note;$('comparison-map').href=pageUrl('/#collection=original&category=maps&item='+set.mapItemId);$('comparison-map').hidden=false;
  $('comparison-model').hidden=!cell?.modelItemId;if(cell?.modelItemId)$('comparison-model').href=pageUrl('/#collection=original&category=models&item='+cell.modelItemId);
  $('comparison-back').href=set.assetBoard||pageUrl('/#collection=original&category=maps&item='+set.mapItemId);$('comparison-back').textContent=set.assetBoard?'도시 에셋 목록으로 ↗':'라그니 원작 맵으로 ↗';
  $('comparison-status').textContent='이미지를 불러오고 있습니다.';$('comparison-pair').setAttribute('aria-busy','true');
  for(const side of ['original','target']){$(side+'-image').hidden=true;$(side+'-full').hidden=true;}
  history.replaceState(null,'','?'+new URLSearchParams({set:set.id,cell:cellId}));document.title=set.title+' · Original ↔ Target | Arcturus';
  try{
    const loaded=await Promise.allSettled(['original','target'].map(side=>loadImage(set[side].file)));if(token!==generation)return;
    ['original','target'].forEach((side,i)=>{
      if(loaded[i].status!=='fulfilled')return;
      const img=$(side+'-image');img.src=crop(loaded[i].value,cell?.[side+'Rect']);img.alt=`${set.title} · ${cell?cell.title:'전체 시트'} · ${side==='original'?'Original 원작':'Target 목표 원화'} · 두 방향`;img.hidden=false;
      $(side+'-full').href=set[side].file.url;$(side+'-full').hidden=false;
    });
    $('comparison-status').textContent=loaded.some(x=>x.status==='rejected')?'연결되지 않은 원본은 빈칸으로 표시합니다.':cell?'같은 건물의 두 방향을 Original과 Target으로 비교합니다.':'전체 시트입니다. 위에서 건물을 선택하면 크게 비교할 수 있습니다.';
  }catch(error){if(token!==generation)return;$('comparison-status').textContent='이미지를 열지 못했습니다. 페이지를 새로고침하거나 자료함에서 원본 연결을 확인하세요.';console.error('Target comparison image unavailable',error);}
  finally{if(token===generation)$('comparison-pair').setAttribute('aria-busy','false');}
}
function chooseSet(id,requested){
  set=data.sets.find(x=>x.id===id)||data.sets[0];cellId=requested==='all'?'all':set.cells.some(x=>x.id===requested)?requested:set.cells[0].id;
  $('comparison-cell').replaceChildren(new Option('전체 시트','all'),...set.cells.map(x=>new Option(`${x.id} · ${x.title}`,x.id)));$('comparison-cell').disabled=false;render();
}
try{
  data=await readJson('/api/target-comparisons');connectionState(true);
    for(const row of data.sets){const b=document.createElement('button');b.dataset.set=row.id;b.textContent=`${row.title} ${row.cells.length}종`;b.onclick=()=>chooseSet(row.id);$('comparison-sets').append(b);}
    $('comparison-cell').onchange=()=>{cellId=$('comparison-cell').value;render();};
    $('comparison-prev').onclick=()=>{const i=set.cells.findIndex(x=>x.id===cellId);if(i>0){cellId=set.cells[i-1].id;render();}};
    $('comparison-next').onclick=()=>{const i=set.cells.findIndex(x=>x.id===cellId);if(i<set.cells.length-1){cellId=set.cells[i+1].id;render();}};
    chooseSet(params.get('set'),params.get('cell'));
}catch(error){connectionState(false);$('comparison-subject').textContent='자료 연결 대기';$('comparison-cell').replaceChildren(new Option('연결된 자료 없음',''));$('comparison-status').textContent='이 PC의 원본이 연결되면 비교 이미지를 표시합니다.';$('comparison-pair').setAttribute('aria-busy','false');}
