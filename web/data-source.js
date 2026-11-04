// The published shell reads registered files from this computer, never from GitHub.
export const localFilesOnly=!!document.querySelector('meta[name="arcturus-local-files"]');
const bridge=localFilesOnly?'http://127.0.0.1:8899':'';
const siteRoot=new URL('.',import.meta.url);
export const pageUrl=path=>new URL(path.replace(/^\//,''),siteRoot).href;
export const sourceUrl=path=>path.startsWith('/files/')||path.startsWith('/api/')||path==='/contributing'?bridge+path:path;
export function connectUrls(value){
  if(typeof value==='string')return value.startsWith('/files/')?sourceUrl(value):value.startsWith('/target-comparison.html')||value.startsWith('/town-assets.html')?pageUrl(value):value;
  if(Array.isArray(value))return value.map(connectUrls);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,connectUrls(item)]));
  return value;
}
export async function readJson(path){
  const response=await fetch(sourceUrl(path),{signal:AbortSignal.timeout(15000),cache:'no-store',credentials:localFilesOnly?'omit':'same-origin'});
  if(response.status===401&&!localFilesOnly){location.href='/login?next='+encodeURIComponent(location.pathname+location.search+location.hash);throw Error('Login required');}
  if(!response.ok)throw Error('Source unavailable');
  return connectUrls(await response.json());
}
export function connectionState(connected){
  const panel=document.getElementById('local-connection');if(!panel)return;
  panel.querySelector('[role="status"]').textContent=connected?'이 PC의 원본 연결됨':'이 PC의 자료 연결 없음 · 자료 영역을 비워두었습니다.';
  panel.dataset.connected=String(connected);
  panel.querySelector('button').hidden=connected;
}
if(localFilesOnly){
  const panel=document.createElement('section');panel.id='local-connection';panel.setAttribute('aria-label','로컬 자료 연결');
  const label=document.createElement('span');label.setAttribute('role','status');label.textContent='이 PC의 자료 연결을 확인하고 있습니다.';
  const button=document.createElement('button');button.textContent='다시 연결';button.onclick=()=>location.reload();button.hidden=true;
  panel.append(label,button);document.querySelector('.topbar').after(panel);
  document.querySelectorAll('a[href="/contributing"],a[href="./contributing"]').forEach(a=>a.href=sourceUrl('/contributing'));
}
