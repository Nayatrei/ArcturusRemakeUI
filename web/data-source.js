// The published shell reads registered files from this computer, never from GitHub.
export const localFilesOnly=!!document.querySelector('meta[name="arcturus-local-files"]');
const companion='http://127.0.0.1:8899';
const bridge=localFilesOnly?companion:'';
const siteRoot=new URL('.',import.meta.url);
export const pageUrl=path=>new URL(path.replace(/^\//,''),siteRoot).href;
export const sourceUrl=path=>path.startsWith('/files/')||path.startsWith('/api/')||path==='/contributing'?bridge+path:path;
export function connectUrls(value){
  if(typeof value==='string')return value.startsWith('/files/')?sourceUrl(value):value.startsWith('/target-comparison.html')||value.startsWith('/town-assets.html')?pageUrl(value):value;
  if(Array.isArray(value))return value.map(connectUrls);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,connectUrls(item)]));
  return value;
}
export function localViewUrl(current){
  const url=new URL(current);
  const name=url.pathname.split('/').pop();
  const page=['target-comparison.html','town-assets.html'].includes(name)?name:'';
  return companion+'/'+page+url.search+url.hash;
}
export async function readJson(path,timeout=15000){
  const options={signal:AbortSignal.timeout(timeout),cache:'no-store',credentials:localFilesOnly?'omit':'same-origin'};
  if(localFilesOnly)options.targetAddressSpace='loopback';
  const response=await fetch(sourceUrl(path),options);
  if(response.status===401&&!localFilesOnly){location.href='/login?next='+encodeURIComponent(location.pathname+location.search+location.hash);throw Error('Login required');}
  if(!response.ok)throw Error('Source unavailable');
  return connectUrls(await response.json());
}
export function connectionState(connected){
  const panel=document.getElementById('local-connection');if(!panel)return;
  panel.querySelector('[role="status"]').textContent=connected?'이 PC의 원본 연결됨':'브라우저에서 원본에 연결하지 못했습니다. 이 PC에서 같은 화면을 직접 열 수 있습니다.';
  panel.dataset.connected=String(connected);
  panel.querySelector('button').hidden=connected;
  panel.querySelector('a').hidden=connected;
}
if(localFilesOnly){
  const panel=document.createElement('section');panel.id='local-connection';panel.setAttribute('aria-label','로컬 자료 연결');
  const label=document.createElement('span');label.setAttribute('role','status');label.textContent='이 PC의 원본을 확인하고 있습니다. 로컬 네트워크 접근 요청이 뜨면 허용해 주세요.';
  const direct=document.createElement('a');
  direct.textContent='이 PC에서 같은 화면 열기';
  direct.href=localViewUrl(location.href);
  direct.addEventListener('click',()=>{direct.href=localViewUrl(location.href);});
  const button=document.createElement('button');button.textContent='다시 연결';button.hidden=true;
  button.onclick=async()=>{
    button.disabled=true;
    label.textContent='PC 자료함에 연결 중입니다. 브라우저의 로컬 접근 요청을 확인해 주세요.';
    try{
      const health=await readJson('/api/health',30000);
      if(health.application!=='arcturus-library')throw Error('Unexpected companion');
      location.reload();
    }catch{connectionState(false);}
    finally{button.disabled=false;}
  };
  panel.append(label,direct,button);document.querySelector('.topbar').after(panel);
  document.querySelectorAll('a[href="/contributing"],a[href="./contributing"]').forEach(a=>a.href=sourceUrl('/contributing'));
}
