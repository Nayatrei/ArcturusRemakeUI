import { readJson, pageUrl, connectionState } from './data-source.js';

const images=new Map();
function loadImage(file){
  if(!file)return Promise.reject(Error('Missing file'));
  if(!images.has(file.url))images.set(file.url,new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>{images.delete(file.url);reject(Error('image'));};img.src=file.url;}));
  return images.get(file.url);
}

export function createComparison(root,{onChoose,standalone=false}){
  let request,version=0,observer;
  const sections=new Map(),cells=new Map();
  const nav=document.createElement('nav'),content=document.createElement('div');
  nav.className='comparison-set-nav';nav.setAttribute('aria-label','마을로 이동');
  root.replaceChildren(nav,content);
  function link(label,url){
    const a=document.createElement('a');a.textContent=label;a.href=url;return a;
  }
  function jump(set,cell){
    const target=cells.get(set+'/'+cell)||sections.get(set);
    target?.scrollIntoView({block:'start'});
  }
  function addSet(set){
    const section=document.createElement('section');
    section.className='target-set';sections.set(set.id,section);
    const button=document.createElement('button');button.textContent=set.title+' · '+set.cells.length+'종';
    button.onclick=()=>{onChoose(set.id,'');jump(set.id,'');};nav.append(button);
    const title=document.createElement('h2');title.textContent=button.textContent;
    const mapLink=link('원작 맵 보기 ↗',pageUrl('/#collection=original&category=maps&item='+set.mapItemId));
    section.append(title,mapLink);
    const grid=document.createElement('div');grid.className='target-grid';section.append(grid);
    for(const cell of set.cells){
      const card=document.createElement('article');card.className='target-card';
      cells.set(set.id+'/'+cell.id,card);
      const heading=document.createElement('h3');heading.textContent=cell.id+' · '+cell.title;
      const pair=document.createElement('div');pair.className='target-pair';card.append(heading,pair);
      for(const side of ['original','target']){
        const sideData=cell[side]||set[side],rect=cell[side+'Rect']||[0,0,...sideData.size];
        const fig=document.createElement('figure'),caption=document.createElement('figcaption');
        caption.textContent=side==='original'?'원작':'목표 원화';
        const a=link('',sideData.file.url);a.target='_blank';a.rel='noopener';a.setAttribute('aria-label',heading.textContent+' '+caption.textContent+' 원본 이미지');
        const canvas=document.createElement('canvas');
        canvas.width=Math.min(680,rect[2]);canvas.height=Math.round(canvas.width*rect[3]/rect[2]);
        a.append(canvas);fig.append(caption,a);pair.append(fig);
        canvas.source={file:sideData.file,rect};observer.observe(canvas);
      }
      if(cell.angleGuide||cell.note){const note=document.createElement('p');note.textContent=cell.angleGuide||cell.note;card.append(note);}
      if(cell.modelItemId)card.append(link('원본 3D 보기 ↗',pageUrl('/#collection=original&category=models&item='+cell.modelItemId)));
      grid.append(card);
    }
    const sheet=document.createElement('div');sheet.className='sheet-links';
    sheet.append(link(set.sheetLabel||'원작 전체 시트',set.original.file.url),link('목표 원화 전체 시트',set.target.file.url));
    if(set.assetBoard)sheet.append(link('건물·다리·공원 전체 에셋 ↗',set.assetBoard));
    section.append(sheet);content.append(section);
  }
  function clear(){
    version++;request=null;observer?.disconnect();images.clear();cells.clear();sections.clear();nav.replaceChildren();
    content.textContent='이 PC의 원본이 연결되면 비교 이미지를 표시합니다.';
  }
  return {clear,async show(id,cell){
    const token=++version;
    try{
      request??=readJson('/api/target-comparisons?views=pairs');
      const data=await request;if(token!==version)return;
      if(!sections.size){
        content.replaceChildren();
        observer=new IntersectionObserver(entries=>{
          for(const entry of entries){
            if(!entry.isIntersecting)continue;
            const canvas=entry.target;observer.unobserve(canvas);
            const {file,rect}=canvas.source;
            loadImage(file).then(img=>{
              if(canvas.isConnected)canvas.getContext('2d').drawImage(img,...rect,0,0,canvas.width,canvas.height);
            }).catch(()=>{if(canvas.isConnected)canvas.replaceWith('이미지를 읽지 못했습니다. 원본 열기 ↗');});
          }
        },{rootMargin:'320px'});
        const preferred=data.sets.find(row=>row.id===id)||data.sets[0];
        for(const row of [preferred,...data.sets.filter(row=>row!==preferred)])addSet(row);
      }
      if(cell==='all'){
        const set=data.sets.find(row=>row.id===id);
        if(set){
          const section=sections.get(id);
          if(!section.querySelector('.sheet-pair')){
            const pair=document.createElement('div');pair.className='target-pair sheet-pair';
            for(const [side,label] of [['original','원작'],['target','목표 원화']]){
              const fig=document.createElement('figure'),img=document.createElement('img'),cap=document.createElement('figcaption');
              cap.textContent=label+' · '+(set.sheetLabel||'전체 시트');img.src=set[side].file.url;img.alt=cap.textContent;
              fig.append(cap,img);pair.append(fig);
            }
            section.querySelector('.target-grid').before(pair);
          }
          jump(id,cell);
        }
      }else if(cell)jump(id,cell);
      if(standalone)connectionState(true);
    }catch{if(token===version){clear();if(standalone)connectionState(false);}}
  }};
}
const standaloneRoot=document.getElementById('standalone-gallery');
if(standaloneRoot){
  const params=new URLSearchParams(location.search);
  createComparison(standaloneRoot,{standalone:true,onChoose:(set,cell)=>{
    history.replaceState(null,'','?'+new URLSearchParams({set,cell}));
  }}).show(params.get('set'),params.get('cell'));
}
