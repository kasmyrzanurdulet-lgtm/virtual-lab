import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const $ = (s) => document.querySelector(s);
const host = $('#canvasHost');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
host.prepend(renderer.domElement); $('.loading').remove();
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x171b18, 10, 24);
const camera = new THREE.PerspectiveCamera(35, 1, .1, 100); camera.position.set(0, 3.0, 7.2);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.target.set(0, 0, 0); controls.minDistance = 3.6; controls.maxDistance = 11; controls.maxPolarAngle = Math.PI * .79;
scene.add(new THREE.HemisphereLight(0xe4eccf, 0x403326, 2.0));
const key = new THREE.DirectionalLight(0xffe5c0, 3.8); key.position.set(-3, 5, 4); key.castShadow = true; scene.add(key);
const rim = new THREE.DirectionalLight(0xb5d47b, 2.1); rim.position.set(4, 2, -4); scene.add(rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200,200), new THREE.MeshStandardMaterial({color:0x181c18,roughness:.94})); floor.rotation.x=-Math.PI/2; floor.position.y=-1.7; scene.add(floor);
const grid = new THREE.GridHelper(24, 28, 0x32392f, 0x252a24); grid.position.y=-1.69; scene.add(grid);
const workGroup = new THREE.Group(); scene.add(workGroup);
let lab='carve', wood='oak', size='medium', pattern='qoshkar', latheForm='vase', workCount=0, depth=.45, burnHeat=.55, taskStarted=false;
let board, surface, boardMaterial, burnOverlay, burnTexture, latheMesh, comparisonMesh, latheProfile=[], carvingData=[], savedState=null, drawing=false, previousUv=null, userPattern=false;
const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
const woodColors={oak:{base:'#b27d4d',dark:'#754727',light:'#d0a26a'},walnut:{base:'#744b31',dark:'#43291c',light:'#a8774d'},pine:{base:'#c29553',dark:'#77552a',light:'#e1bd7a'}};
const patternNames={qoshkar:'Қошқармүйіз',tuyetaban:'Түйетабан',kuskanat:'Құсқанаты',geo:'Геометриялық ою'};

function makeWoodTexture(){
  const c=document.createElement('canvas'); c.width=1024;c.height=768;const x=c.getContext('2d'); const t=woodColors[wood];
  x.fillStyle=t.base;x.fillRect(0,0,c.width,c.height);
  let seed=152;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  for(let i=0;i<360;i++){const y=rand()*c.height;const w=5+rand()*22;x.beginPath();x.moveTo(0,y);x.bezierCurveTo(270,y+(rand()-.5)*w,650,y+(rand()-.5)*w,1024,y+(rand()-.5)*w);x.strokeStyle=rand()>.53?`rgba(64,35,17,${.035+rand()*.11})`:`rgba(255,222,163,${.025+rand()*.07})`;x.lineWidth=.5+rand()*3;x.stroke()}
  for(let i=0;i<32;i++){const xx=rand()*c.width, yy=rand()*c.height, rx=7+rand()*35, ry=2+rand()*7;x.beginPath();x.ellipse(xx,yy,rx,ry,0,0,Math.PI*2);x.strokeStyle='rgba(70,39,19,.18)';x.lineWidth=1;x.stroke()}
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;return tex;
}
function makeBoard(){
  const sizes={small:[3.3,2.2],medium:[4.2,2.8],large:[5,3.3]};const [w,h]=sizes[size];
  const geo=new THREE.PlaneGeometry(w,h,100,72); const pos=geo.attributes.position;
  carvingData=new Float32Array(pos.count);
  if(savedState?.carving && savedState.carving.length===pos.count)carvingData.set(savedState.carving);
  for(let i=0;i<pos.count;i++)pos.setZ(i,carvingData[i]);pos.needsUpdate=true;geo.computeVertexNormals();
  boardMaterial=new THREE.MeshStandardMaterial({map:makeWoodTexture(),roughness:.73,metalness:0,side:THREE.DoubleSide});
  surface=new THREE.Mesh(geo,boardMaterial); surface.receiveShadow=true;surface.castShadow=true; surface.rotation.x=-Math.PI/2;surface.position.y=0;surface.userData={w,h};
  comparisonMesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h,24,18),new THREE.MeshBasicMaterial({color:0xbce885,wireframe:true,transparent:true,opacity:.45,depthWrite:false}));comparisonMesh.rotation.x=-Math.PI/2;comparisonMesh.position.y=.035;comparisonMesh.visible=false;
  const body=new THREE.Mesh(new THREE.BoxGeometry(w+.12,.32,h+.12),new THREE.MeshStandardMaterial({color:woodColors[wood].dark,roughness:.8}));body.position.y=-.17;body.castShadow=true;body.receiveShadow=true;
  const edge=new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry),new THREE.LineBasicMaterial({color:0x382719,transparent:true,opacity:.65}));edge.position.copy(body.position);
  workGroup.add(body,edge,surface,comparisonMesh); board=surface;
  if(lab==='burn')makeBurnOverlay(w,h);
  const stand=new THREE.Mesh(new THREE.BoxGeometry(w+.38,.12,.6),new THREE.MeshStandardMaterial({color:0x30332d,roughness:.8}));stand.position.set(0,-.43,0);workGroup.add(stand);
}
function makeBurnOverlay(w,h){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=768;
  if(savedState?.burnImage){const img=new Image();img.onload=()=>{canvas.getContext('2d').drawImage(img,0,0,1024,768);burnTexture.needsUpdate=true};img.src=savedState.burnImage}
  burnTexture=new THREE.CanvasTexture(canvas);burnTexture.colorSpace=THREE.SRGBColorSpace;
  const geo=new THREE.PlaneGeometry(w,h,1,1);burnOverlay=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:burnTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));burnOverlay.rotation.x=-Math.PI/2;burnOverlay.position.y=.018;workGroup.add(burnOverlay);burnOverlay.userData.canvas=canvas;
}
function makeLathe(){
  const presets={vase:[[.25,-1.25],[.48,-1.05],[.65,-.58],[.54,-.05],[.36,.25],[.68,.66],[.55,1.1],[.3,1.25]],chess:[[.2,-1.25],[.48,-1.1],[.34,-.82],[.22,-.35],[.55,-.1],[.31,.26],[.23,.7],[.49,.9],[.35,1.15],[.12,1.3]],column:[[.26,-1.3],[.45,-1.15],[.39,-.9],[.52,-.76],[.42,-.35],[.5,0],[.42,.42],[.52,.76],[.39,.9],[.45,1.15],[.26,1.3]],cup:[[.25,-1.25],[.55,-1.1],[.38,-.7],[.25,-.25],[.4,.15],[.72,.5],[.67,1.2],[.58,1.25]]};
  const points=presets[latheForm].map(([r,y])=>new THREE.Vector2(r,y));
  latheProfile=points.map(v=>v.x);const geo=new THREE.LatheGeometry(points,96);geo.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({map:makeWoodTexture(),roughness:.62});latheMesh=new THREE.Mesh(geo,mat);latheMesh.castShadow=true;latheMesh.receiveShadow=true;workGroup.add(latheMesh);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.85,.85,.12,64),new THREE.MeshStandardMaterial({color:0x33342e,roughness:.7}));base.position.y=-1.53;workGroup.add(base);
}
function clearGroup(){while(workGroup.children.length){const o=workGroup.children.pop();if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose()}}}
function buildScene(){clearGroup();if(lab==='lathe')makeLathe();else makeBoard();$('#viewMode').textContent=lab==='lathe'?'АЙНАЛАТЫН 3D ЖҰМЫС АЙМАҒЫ':'ҮШ ӨЛШЕМДІ ЖҰМЫС АЙМАҒЫ';resize();}
function resize(){const r=host.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix()}
new ResizeObserver(resize).observe(host); buildScene();

const labConfig={
 carve:{title:'Ағашқа ою салу',crumb:'АҒАШТЫ ОЮ',step:'01 · 03',subtitle:'Өрнекті таңда да, қашауды жүргізіп, ағаш бетіне ойық түсір.',task:'Ағашқа қошқармүйіз оюын түсір',desc:'Өрнекті дайындама ортасына орналастырып, бедерін біркелкі ой.',action:'Оюды бастау',tool:'Жалпақ қашау',tip:'Бетті өңдеу үшін ағашқа басып, сүйреңіз',stage:'ЕМЕН · ҚАШАУ'},
 burn:{title:'Ағашты күйдіру',crumb:'КҮЙДІРУ ӨНЕРІ',step:'02 · 03',subtitle:'Виртуалды қаламмен сурет салып, ағаш бетінде күйген із қалдыр.',task:'Ағаш тақтасына өрнек күйдір',desc:'Бетке басып, сүйре. Қалам өткен жерге табиғи қоңыр із түседі.',action:'Күйдіруді бастау',tool:'Пирографиялық қалам',tip:'Қаламмен тақтаға сурет салыңыз',stage:'ҚАРАҒАЙ · КҮЙДІРУ'},
 lathe:{title:'Ағашты жону',crumb:'АҒАШТЫ ЖОНУ',step:'03 · 03',subtitle:'Дайындаманың профилін өзгертіп, ағаш бұйымын 360° қара.',task:'Ағаштан сәндік ваза жаса',desc:'Айналатын дайындама профилін сүйреу арқылы өзгертіп көр.',action:'Жонуды бастау',tool:'Виртуалды жону құралы',tip:'Пішінді өзгерту үшін дайындаманы жоғары-төмен сүйреңіз',stage:'ЕМЕН · ЖОНУ'},
};
function updateLabUI(){const c=labConfig[lab];$('#title').innerHTML=c.title.replace(' ', ' <em>')+'</em>';$('#crumbName').textContent=c.crumb;$('#stepLabel').textContent=c.step;$('#subtitle').textContent=c.subtitle;$('#taskTitle').textContent=c.task;$('#taskDescription').textContent=c.desc;$('#actionLabel').textContent=taskStarted?'Тапсырманы жалғастыру':'Тапсырманы орындау';$('#toolName').textContent=c.tool;$('#canvasTip').textContent=c.tip;$('#stageText').textContent=c.stage;$('#taskBtn').classList.toggle('done',false);$('#progressBar').style.width='0%';$('#progressText').textContent=taskStarted?'Құралды дайындамаға жүргізіңіз':'Бастауға дайын';$('#progressSpinner').hidden=true;$('#workCount').textContent=workCount;$('#statusText').textContent=lab==='lathe'?'Айналдыруға дайын':'Жұмыс аймағы дайын';$('#patternSection').style.display=lab==='carve'||lab==='lathe'?'':'none';$('#pickLabel').textContent=lab==='lathe'?'ДАЙЫН БҰЙЫМ ПІШІНІ':'ОЮ ҮЛГІСІ';$('#customPattern').style.display=lab==='carve'?'':'none';$('#toolSection').style.display='';$('#depthRange').previousElementSibling.firstElementChild.textContent=lab==='burn'?'Қалам қызуы':lab==='lathe'?'Өңдеу тереңдігі':'Ою тереңдігі';$('#dimensionLabel').textContent=lab==='lathe'?'Ø 80 × 120 мм':size==='small'?'180 × 120 × 24 мм':size==='large'?'300 × 200 × 24 мм':'240 × 160 × 24 мм';$('#helpTitle').textContent=c.title;$('#helpText').textContent=lab==='carve'?'Өрнек түрін таңда. Қашаумен ағаш бетінің үстінен басып, сүйре: құрал өткен жерде геометриялық ойық пайда болады. Тереңдігін бүйір панельден ретте. Көріністі бұру үшін бос аймақты сүйре немесе тінтуір дөңгелегін қолдан.':lab==='burn'?'Қаламды ағаш тақта үстінен сүйре. Сызылған әрбір сызық ағашқа қабаттасқан мөлдір сурет емес, тақта бетіне жабыстырылған жеке материалдық із ретінде көрінеді. Сызық қалыңдығы мен қарайюын қалам қызуы басқарады.':'Дайындаманы таңдалған пішінмен бастайсың. Көрініс айналып тұрады. Ағашқа басып, жоғары-төмен сүйре: сол биіктіктегі көлденең қиманың радиусы өзгереді.';document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.lab===lab));document.querySelectorAll('[data-pattern]').forEach(b=>b.style.display=lab==='carve'?'':'none');document.querySelectorAll('[data-form]').forEach(b=>{b.style.display=lab==='lathe'?'':'none';b.classList.toggle('active',b.dataset.form===latheForm)});}
updateLabUI();

function setPointer(e){const rect=renderer.domElement.getBoundingClientRect();pointer.x=((e.clientX-rect.left)/rect.width)*2-1;pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera)}
renderer.domElement.addEventListener('pointerdown',e=>{if(!board&&!latheMesh)return;setPointer(e);const hit=raycaster.intersectObject(lab==='lathe'?latheMesh:surface)[0];if(!hit)return;drawing=true;taskStarted=true;$('#actionLabel').textContent='Тапсырманы жалғастыру';setTaskBusy(true,'Өңдеу жүріп жатыр…');controls.enabled=false;previousUv=hit.uv?.clone();renderer.domElement.setPointerCapture(e.pointerId);if(lab==='carve')carveAt(hit.point);else if(lab==='burn')burnAt(hit.uv,e);else if(lab==='lathe')turnAt(hit.point);});
renderer.domElement.addEventListener('pointermove',e=>{if(!drawing)return;setPointer(e);if(lab==='carve'){const hit=raycaster.intersectObject(surface)[0];if(hit)carveAt(hit.point)}else if(lab==='burn'){const hit=raycaster.intersectObject(surface)[0];if(hit)burnAt(hit.uv,e)}else if(lab==='lathe'){const hit=raycaster.intersectObject(latheMesh)[0];if(hit)turnAt(hit.point)}});
function stopDraw(){if(drawing){drawing=false;controls.enabled=true;previousUv=null;setTaskBusy(false);markProgress()}}
renderer.domElement.addEventListener('pointerup',stopDraw);renderer.domElement.addEventListener('pointercancel',stopDraw);renderer.domElement.addEventListener('lostpointercapture',stopDraw);
function carveAt(point){const pos=surface.geometry.attributes.position;const local=surface.worldToLocal(point.clone());const radius=.17+depth*.22, amount=.009+depth*.018;for(let i=0;i<pos.count;i++){const dx=pos.getX(i)-local.x,dy=pos.getY(i)-local.y,d=Math.hypot(dx,dy);if(d<radius){const f=(1+Math.cos(Math.PI*d/radius))*.5;const old=carvingData[i];carvingData[i]=Math.max(-.2,old-amount*f);pos.setZ(i,carvingData[i])}}pos.needsUpdate=true;surface.geometry.computeVertexNormals();workCount++;$('#workCount').textContent=workCount;}
function burnAt(uv,e){if(!uv||!burnOverlay)return;const c=burnOverlay.userData.canvas,ctx=c.getContext('2d');const x=uv.x*c.width,y=(1-uv.y)*c.height;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=`rgba(${Math.round(112-54*burnHeat)},${Math.round(63-37*burnHeat)},${Math.round(35-22*burnHeat)},${.5+burnHeat*.42})`;ctx.shadowColor='rgba(56,22,8,.55)';ctx.shadowBlur=2+burnHeat*3;ctx.lineWidth=(2+burnHeat*9)*(e.pressure&&e.pressure<1?Math.max(.6,e.pressure):1);ctx.beginPath();if(previousUv){ctx.moveTo(previousUv.x*c.width,(1-previousUv.y)*c.height)}else ctx.moveTo(x,y);ctx.lineTo(x,y);ctx.stroke();previousUv=uv.clone();burnTexture.needsUpdate=true;workCount++;$('#workCount').textContent=workCount;}
function turnAt(point){const p=latheMesh.worldToLocal(point.clone());const idx=THREE.MathUtils.clamp(Math.round((p.y+1.3)/2.6*(latheProfile.length-1)),0,latheProfile.length-1);const strength=.018+depth*.05;for(let n=-2;n<=2;n++){const k=idx+n;if(k>=0&&k<latheProfile.length){const f=1-Math.abs(n)/3;latheProfile[k]=THREE.MathUtils.clamp(latheProfile[k]-strength*f,.14,.78)}}const points=latheProfile.map((r,i)=>new THREE.Vector2(r,-1.3+i*2.6/(latheProfile.length-1)));const old=latheMesh.geometry;latheMesh.geometry=new THREE.LatheGeometry(points,96);old.dispose();latheMesh.geometry.computeVertexNormals();workCount++;$('#workCount').textContent=workCount;}
function markProgress(){const p=Math.min(100,Math.max(8,Math.round(workCount/6)*8));$('#progressBar').style.width=p+'%';$('#progressText').textContent=p>=100?'Тапсырма орындалды':workCount?'Өңдеу жалғасуда':taskStarted?'Құралды дайындамаға жүргізіңіз':'Бастауға дайын';$('#statusText').textContent=workCount?'Материал өңделді · сақтауға дайын':'Жұмыс аймағы дайын';$('#qualityValue').textContent=workCount?(lab==='burn'?Math.round(burnHeat*100)+'%':Math.min(100,Math.round(depth*100))+'%'):'—';$('#taskBtn').classList.toggle('done',p>=100);scheduleAutoSave()}
function setTaskBusy(busy,message){$('#progressSpinner').hidden=!busy;if(message)$('#progressText').textContent=message}

document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{if(lab===b.dataset.lab)return;lab=b.dataset.lab;workCount=0;taskStarted=false;buildScene();updateLabUI();$('#qualityValue').textContent='—';scheduleAutoSave()}));
document.querySelectorAll('[data-pattern]').forEach(b=>b.addEventListener('click',()=>{pattern=b.dataset.pattern;document.querySelectorAll('[data-pattern]').forEach(x=>x.classList.toggle('active',x===b));toast(patternNames[pattern]+' үлгісі таңдалды');$('#taskTitle').textContent=`Ағашқа ${patternNames[pattern].toLowerCase()} оюын түсір`;scheduleAutoSave()}));
document.querySelectorAll('[data-form]').forEach(b=>b.addEventListener('click',()=>{latheForm=b.dataset.form;document.querySelectorAll('[data-form]').forEach(x=>x.classList.toggle('active',x===b));buildScene();scheduleAutoSave();toast(b.querySelector('small').textContent+' пішіні таңдалды')}));
$('#depthRange').addEventListener('input',e=>{depth=Number(e.target.value)/100;burnHeat=depth;$('#depthValue').textContent=e.target.value+'%';scheduleAutoSave()});
$('#woodSelect').addEventListener('change',e=>{wood=e.target.value;buildScene();scheduleAutoSave();toast('Ағаш материалы жаңартылды')});
document.querySelectorAll('.segmented button').forEach(b=>b.addEventListener('click',()=>{size=b.dataset.size;document.querySelectorAll('.segmented button').forEach(x=>x.classList.toggle('selected',x===b));$('#sizeValue').textContent={small:'Кіші',medium:'Орташа',large:'Үлкен'}[size];buildScene();updateLabUI();scheduleAutoSave()}));
$('#actionBtn').addEventListener('click',()=>{taskStarted=true;$('#actionLabel').textContent='Тапсырманы жалғастыру';if(lab==='lathe'){latheMesh.rotation.z+=Math.PI/2;toast('Дайындама бұрылды. Пішінді өзгертіп көріңіз.')}else{toast(lab==='burn'?'Тапсырма басталды. Қаламмен ағашқа сурет салыңыз.':'Тапсырма басталды. Қашауды ағаш бетімен жүргізіңіз.')}$('#progressText').textContent='Құралды дайындамаға жүргізіңіз';$('#statusText').textContent='Тапсырма басталды';scheduleAutoSave()});
$('#taskBtn').addEventListener('click',()=>{$('#canvasHost').scrollIntoView({behavior:'smooth',block:'center'});toast('Тапсырмаға сәттілік!')});
$('#viewBtn').addEventListener('click',()=>{camera.position.set(0,5.4,.2);controls.target.set(0,0,0);controls.update();setTimeout(()=>{camera.position.set(0,3,7.2);controls.update()},1800)});
$('#zoomIn').addEventListener('click',()=>{camera.position.multiplyScalar(.85);controls.update()});$('#zoomOut').addEventListener('click',()=>{camera.position.multiplyScalar(1.17);controls.update()});
$('#fullscreenBtn').addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen();else host.requestFullscreen?.()});
$('#helpBtn').addEventListener('click',()=>$('#helpDialog').showModal());$('#closeHelp').addEventListener('click',()=>$('#helpDialog').close());$('#gotIt').addEventListener('click',()=>$('#helpDialog').close());$('#customPattern').addEventListener('click',()=>toast('Өз өрнегін импорттау келесі кезеңге жоспарланған'));
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2400)}
let autoSaveTimer;
function scheduleAutoSave(){
  $('#saveLabel').textContent='Автоматты сақтау…';
  if(!drawing)setTaskBusy(true,'Жұмыс сақталып жатыр…');
  clearTimeout(autoSaveTimer);
  autoSaveTimer=setTimeout(()=>{try{localStorage.setItem('virtualArtWorkshop',JSON.stringify(state()));$('#saveLabel').textContent='Автоматты сақталды';$('#savedAt').textContent='АВТО · '+new Date().toLocaleTimeString('kk-KZ',{hour:'2-digit',minute:'2-digit'});if(!drawing){setTaskBusy(false);$('#progressText').textContent=workCount?'Жұмыс сақталды':taskStarted?'Құралды жүргізіңіз':'Бастауға дайын'}}catch{$('#saveLabel').textContent='Сақтау орындалмады';setTaskBusy(false)}},650);
}
function state(){return{lab,wood,size,pattern,latheForm,workCount,depth,taskStarted,carving:Array.from(carvingData),burnImage:burnOverlay?.userData.canvas.toDataURL()||null,latheProfile}}
$('#saveBtn').addEventListener('click',()=>{try{localStorage.setItem('virtualArtWorkshop',JSON.stringify(state()));$('#saveLabel').textContent='Жұмыс сақталды';$('#savedAt').textContent='САҚТАЛДЫ · '+new Date().toLocaleTimeString('kk-KZ',{hour:'2-digit',minute:'2-digit'});toast('Жұмысыңыз осы құрылғыда сақталды')}catch(e){toast('Сақтау орындалмады: жад көлемі жеткіліксіз')}});
$('#resetBtn').addEventListener('click',()=>{if(workCount&&!confirm('Ағымдағы өңдеуді қалпына келтіресіз бе?'))return;workCount=0;savedState=null;buildScene();updateLabUI();$('#qualityValue').textContent='—';scheduleAutoSave();toast('Жұмыс аймағы қалпына келтірілді')});
$('#compareBtn').addEventListener('click',()=>{if(lab==='lathe'){toast('Жону зертханасында пішінді 360° қарап өзгертіңіз');return}comparisonMesh.visible=!comparisonMesh.visible;$('#compareBtn').innerHTML=comparisonMesh.visible?'БАСТАПҚЫ ҚАЛЫП <span>↗</span>':'АЛДЫН / КЕЙІН <span>↗</span>';toast(comparisonMesh.visible?'Бастапқы бет контуры көрсетілді':'Өңделген бет көрсетілді')});
try{const s=JSON.parse(localStorage.getItem('virtualArtWorkshop')||'null');if(s){savedState=s;labConfig[s.lab]&& (lab=s.lab);wood=s.wood||wood;size=s.size||size;pattern=s.pattern||pattern;latheForm=s.latheForm||latheForm;workCount=s.workCount||0;depth=s.depth||depth;taskStarted=Boolean(s.taskStarted);$('#woodSelect').value=wood;$('#depthRange').value=Math.round(depth*100);$('#depthValue').textContent=Math.round(depth*100)+'%';document.querySelectorAll('.segmented button').forEach(b=>b.classList.toggle('selected',b.dataset.size===size));$('#sizeValue').textContent={small:'Кіші',medium:'Орташа',large:'Үлкен'}[size];buildScene();updateLabUI();$('#workCount').textContent=workCount;markProgress()}}catch{}

function animate(){requestAnimationFrame(animate);if(lab==='lathe'&&!drawing&&latheMesh)latheMesh.rotation.y+=.004;controls.update();renderer.render(scene,camera)}animate();
