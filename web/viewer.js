import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export { release, materialMode };

const loader = new GLTFLoader();
function release(object) {
  const materials=new Set(),textures=new Set(),geometries=new Set();
  object?.traverse(n=>{if(n.geometry)geometries.add(n.geometry);for(const m of [].concat(n.material||[],n.userData.originalMaterial||[])){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
  geometries.forEach(g=>g.dispose());textures.forEach(t=>{t.source?.data?.close?.();t.dispose();});materials.forEach(m=>m.dispose());
}
function materialMode(object, mode) {
  object.traverse(n=>{
    if(!n.isMesh)return;
    n.userData.originalMaterial??=n.material;
    if(n.material!==n.userData.originalMaterial)[].concat(n.material).forEach(m=>m.dispose());
    const original=n.userData.originalMaterial;
    if(mode==='lit'){n.material=original;return;}
    const convert=m=>new THREE.MeshBasicMaterial({map:mode==='original'?m.map:null,color:mode==='original'?m.color:0xd2cab6,
      transparent:mode==='original'?m.transparent:false,opacity:mode==='original'?m.opacity:1,alphaTest:mode==='original'?m.alphaTest:0,
      side:THREE.DoubleSide,wireframe:mode==='wire'});
    n.material=Array.isArray(original)?original.map(convert):convert(original);
  });
}
function stage(width,height){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));renderer.setSize(width,height,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x181818);
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x8b8068,2.4));
  const light=new THREE.DirectionalLight(0xfff3d9,2.4);light.position.set(2,4,3);scene.add(light);
  const camera=new THREE.PerspectiveCamera(38,width/height,.01,10000);
  return {renderer,scene,camera};
}
function center(object){
  const box=new THREE.Box3().setFromObject(object);const size=box.getSize(new THREE.Vector3());
  object.position.sub(box.getCenter(new THREE.Vector3()));
  return {radius:Math.max(size.length()/2,.01),half:size.multiplyScalar(.5)};
}
function place(camera,bounds,top=false){
  const {radius,half}=bounds;
  const direction=new THREE.Vector3(...(top?[0,1,.0001]:[.9,.8,1.2])).normalize();
  const right=new THREE.Vector3().crossVectors(camera.up,direction).normalize();
  const up=new THREE.Vector3().crossVectors(direction,right).normalize();
  const tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanX=tanY*camera.aspect;
  let distance=radius;
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
    const corner=new THREE.Vector3(half.x*x,half.y*y,half.z*z),depth=corner.dot(direction);
    distance=Math.max(distance,Math.abs(corner.dot(right))/tanX+depth,Math.abs(corner.dot(up))/tanY+depth);
  }
  distance*=1.08;
  camera.near=radius/1000;camera.far=distance*15;
  camera.position.copy(direction.multiplyScalar(distance));
  camera.lookAt(0,0,0);camera.updateProjectionMatrix();
}
export class ModelViewer {
  constructor(container,status){this.container=container;this.status=status;this.generation=0;this.mode='original';}
  clear(){this.generation++;this.abort?.abort();this.observer?.disconnect();this.controls?.dispose();release(this.model);this.renderer?.dispose();this.renderer?.forceContextLoss();this.model=null;this.renderer=null;this.container.replaceChildren();}
  async load(file){
    this.clear();const generation=this.generation;this.abort=new AbortController();
    this.status('모델 읽는 중');
    const loading=document.createElement('div');loading.className='loading-state';loading.innerHTML='<span></span><p>원본 3D를 읽고 있습니다.</p>';this.container.append(loading);
    try{
      const response=await fetch(file.url,{signal:this.abort.signal});if(!response.ok)throw new Error('원본 파일을 읽지 못했습니다.');
      const buffer=await response.arrayBuffer();if(generation!==this.generation)return;
      this.status('3D 구성 중');const gltf=await loader.parseAsync(buffer,'/');
      if(generation!==this.generation){release(gltf.scene);return;}
      const width=this.container.clientWidth,height=this.container.clientHeight;
      Object.assign(this,stage(width,height));this.model=gltf.scene;this.bounds=center(this.model);this.radius=this.bounds.radius;materialMode(this.model,this.mode);this.scene.add(this.model);
      place(this.camera,this.bounds);this.container.replaceChildren(this.renderer.domElement);
      this.renderer.domElement.setAttribute('aria-label',file.name+' 3D 미리보기. 마우스로 회전하고 휠로 확대합니다.');
      this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=false;
      this.controls.minDistance=this.radius*.02;this.controls.maxDistance=this.radius*30;
      this.controls.addEventListener('change',()=>this.draw());
      this.observer=new ResizeObserver(()=>{const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h||!this.renderer)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.draw();});
      this.observer.observe(this.container);this.draw();this.status('3D 준비됨');
    }catch(e){if(generation!==this.generation||e.name==='AbortError')return;this.status('미리보기 오류');const p=document.createElement('p');p.className='error';p.textContent='3D를 표시하지 못했습니다. 관련 파일에서 원본을 다운로드할 수 있습니다.';this.container.replaceChildren(p);console.error('Model preview failed',e);}
  }
  draw(){if(this.renderer)this.renderer.render(this.scene,this.camera);}
  view(top=false){if(!this.model)return;this.controls.target.set(0,0,0);place(this.camera,this.bounds,top);this.controls.update();this.draw();}
  zoom(factor){if(!this.model)return;const offset=this.camera.position.clone().sub(this.controls.target).multiplyScalar(factor);offset.clampLength(this.controls.minDistance,this.controls.maxDistance);this.camera.position.copy(this.controls.target).add(offset);this.controls.update();this.draw();}
  setMaterial(mode){this.mode=mode;if(this.model){materialMode(this.model,mode);this.draw();}}
}

let thumbnailStage,queue=[],busy=false,epoch=0;const memory=new Map();
export function resetThumbnails(){epoch++;queue=[];}
export function thumbnail(file,img){
  if(memory.has(file.id)){img.src=memory.get(file.id);return;}
  queue.push({file,img,epoch});runQueue();
}
async function runQueue(){
  if(busy)return;busy=true;
  while(queue.length){
    const job=queue.shift();if(job.epoch!==epoch||!job.img.isConnected)continue;
    let object;
    try{
      thumbnailStage??=stage(320,220);
      const response=await fetch(job.file.url);if(!response.ok)throw Error('file');
      const data=await response.arrayBuffer();if(job.epoch!==epoch)continue;
      object=(await loader.parseAsync(data,'/')).scene;
      const {renderer,camera,scene}=thumbnailStage;const bounds=center(object);materialMode(object,'original');scene.add(object);place(camera,bounds);renderer.render(scene,camera);
      const url=renderer.domElement.toDataURL('image/webp',.75);memory.set(job.file.id,url);
      if(memory.size>96)memory.delete(memory.keys().next().value);
      if(job.img.isConnected)job.img.src=url;scene.remove(object);
    }catch{if(job.img.isConnected){job.img.remove();}}
    finally{if(object)release(object);}
  }
  busy=false;
}
