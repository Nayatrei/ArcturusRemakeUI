import { readJson, sourceUrl, localFilesOnly, localViewUrl } from './data-source.js';

let registryPromise,sequence=0;
export function resetArtworkSelections(){registryPromise=undefined;}
async function registry(){
  if(!registryPromise)registryPromise=readJson('/api/artwork-selections').catch(error=>{registryPromise=undefined;throw error;});
  return registryPromise;
}
export async function sourceArtwork(sourceId){
  return Object.values((await registry()).works).filter(work=>work.sourceId===sourceId);
}
function paint(gallery,state,message='',busy=false){
  const row=gallery.previousElementSibling;
  const selected=state.selectionValid&&state.selection;
  row.querySelector('[role="status"]').textContent=message||(state.error||(state.skipped?'진행 안 함 · 저장됨':!state.selection?'최종 원화 선택 대기':!state.selectionValid?'선택했던 원화가 변경됐습니다. 다시 확인해 주세요.':`최종 원화 ${state.selection.label} · 저장됨`));
  gallery.setAttribute('aria-busy',String(busy));
  for(const button of gallery.querySelectorAll('[data-choice-image]')){
    const option=state.options.find(x=>x.imageId===button.dataset.choiceImage&&x.key===button.dataset.choiceKey);
    if(!option){button.disabled=true;button.textContent='새로고침 필요';button.setAttribute('aria-pressed','false');continue;}
    const chosen=selected?.imageId===option.imageId&&selected?.key===option.key;
    button.setAttribute('aria-pressed',String(!!chosen));button.textContent=chosen?`${option.label} 선택됨`:`${option.label} 선택`;button.disabled=busy||state.skipped;
    button.closest('figure').classList.toggle('artwork-chosen',!!chosen);
  }
  const cancel=row.querySelector('[data-choice-cancel]');cancel.hidden=!state.selection;cancel.disabled=busy;
  const skip=row.querySelector('[data-choice-skip]');skip.disabled=busy;skip.textContent=state.skipped?'다시 검토':'× 진행 안 함';skip.setAttribute('aria-pressed',String(!!state.skipped));skip.setAttribute('aria-label',skip.dataset.choiceSkip+(state.skipped?' 다시 검토':' 진행 안 함'));
}
function repaint(workId,state,message='',busy=false){
  for(const gallery of document.querySelectorAll('[data-artwork-work]'))if(gallery.dataset.artworkWork===workId)paint(gallery,state,message,busy);
  if(!busy)for(const panel of document.querySelectorAll('[data-choice-source]'))if(panel.dataset.choiceSource===workId)panel.dispatchEvent(new CustomEvent('choice-updated',{detail:state}));
}
async function save(workId,imageId,optionKey=null,action=imageId?'select':'clear'){
  const data=await registry(),state=data.works[workId];
  const option=state.options.find(x=>x.imageId===imageId&&x.key===optionKey);
  if(imageId&&state.selectionValid&&state.selection?.imageId===imageId&&state.selection?.key===optionKey)return;
  repaint(workId,state,'선택을 저장하고 있습니다.',true);
  try{
    const response=await fetch(sourceUrl('/api/artwork-selections'),{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({workId,imageId,optionKey,action,sha256:option?.sha256||null,expectedRevision:state.revision}),signal:AbortSignal.timeout(15000)});
    const result=await response.json();
    if(!response.ok){
      if(response.status===409){resetArtworkSelections();const fresh=await registry();repaint(workId,fresh.works[workId],result.error);return;}
      throw Error(result.error||'선택을 저장하지 못했습니다. 다시 시도하세요.');
    }
    data.works[workId]=result;repaint(workId,result,imageId||action==='skip'?'': '최종 원화 선택 대기');
  }catch(error){repaint(workId,state,error.message||'선택을 저장하지 못했습니다. 다시 시도하세요.');}
}
export async function attachArtworkChoices(gallery,work,images){
  if(work.kind!=='work'||!images.length)return;
  let state;
  try{state=(await registry()).works[work.id];}catch{
    if(gallery.isConnected){const error=document.createElement('p');error.setAttribute('role','alert');error.textContent='원화 선택 정보를 읽지 못했습니다. 자료 새로고침으로 다시 확인하세요.';gallery.before(error);}return;
  }
  if(!gallery.isConnected||!state||gallery.dataset.artworkWork)return;
  const row=document.createElement('div');row.className='artwork-selection-status';
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.id='artwork-choice-status-'+(++sequence);row.append(status);
  gallery.before(row);
  if(localFilesOnly){
    status.textContent='최종 원화 선택을 저장하려면 PC 자료함을 열어주세요.';
    const link=document.createElement('a');link.href=localViewUrl(location.href);link.textContent='이 PC 자료함에서 선택하기';row.append(link);return;
  }
  if(state.error){status.textContent=state.error;return;}
  gallery.dataset.artworkWork=work.id;
  const figures=gallery.querySelectorAll('figure');
  images.forEach((image,index)=>{
    const options=state.options.filter(x=>x.imageId===image.id);
    if(options.length>1)figures[index].classList.add('artwork-sheet');
    for(const option of options){
    const button=document.createElement('button');button.type='button';button.className='artwork-choice';button.dataset.choiceImage=image.id;button.dataset.choiceKey=option.key;
    button.setAttribute('aria-label',`${work.title} ${option.label} 선택`);button.setAttribute('aria-describedby',status.id);
    button.onclick=()=>save(work.id,image.id,option.key);figures[index].append(button);
    }
  });
  const cancel=document.createElement('button');cancel.type='button';cancel.dataset.choiceCancel='';cancel.textContent='선택 취소';cancel.setAttribute('aria-label',work.title+' 원화 선택 취소');cancel.onclick=()=>save(work.id,null);row.append(cancel);
  const skip=document.createElement('button');skip.type='button';skip.dataset.choiceSkip=work.title;skip.onclick=async()=>{const current=(await registry()).works[work.id];save(work.id,null,null,current.skipped?'clear':'skip');};row.append(skip);
  paint(gallery,state);
}
