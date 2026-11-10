(() => {
'use strict';
const M=window.HeadingModel;
let state=M.createRun(),playing=false,raf=null,last=null,accumulator=0;
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
const $=id=>document.getElementById(id);
function render(){
 const names={pOnly:'P-only',oscillate:'แกว่ง',damped:'ลดการแกว่ง','กำหนดเอง':'กำหนดเอง'};
 $('explanation').textContent=`เป้า ${state.config.target}° · A: ${names[Object.entries(M.PRESETS).find(([k,g])=>['p','i','d'].every(t=>g[t]===state.config.a[t]))?.[0]||'กำหนดเอง']} / B: ${names[Object.entries(M.PRESETS).find(([k,g])=>['p','i','d'].every(t=>g[t]===state.config.b[t]))?.[0]||'กำหนดเอง']} · แรงรบกวน ${state.config.wind} หน่วยจำลอง · กราฟแสดง error เทียบเวลา`;
 const signed=n=>(n<0?'−':'+')+Math.abs(n).toFixed(1);
 for(const lane of ['a','b']){
  const s=state[lane],error=M.wrapError(state.config.target,s.heading);
  $('arrow-'+lane).setAttribute('transform',`translate(150 150) rotate(${s.heading})`);
  $('target-'+lane).setAttribute('transform',`translate(150 150) rotate(${state.config.target})`);
  $('heading-'+lane).textContent=s.heading.toFixed(1)+'°';$('error-'+lane).textContent=signed(error)+'°';
  const rad=Math.PI/180,start=s.heading*rad,end=(s.heading+error)*rad,x=150+65*Math.sin(start),y=150-65*Math.cos(start),ex=150+65*Math.sin(end),ey=150-65*Math.cos(end);
  $('error-arc-'+lane).setAttribute('d',Math.abs(error)<.01?'':`M${x} ${y} A65 65 0 0 ${error>0?1:0} ${ex} ${ey}`);
  for(const term of ['p','i','d']){const value=s[term],width=Math.min(50,Math.abs(value)/60*50),bar=$('bar-'+lane+'-'+term);bar.style.left=(value<0?50-width:50)+'%';bar.style.width=width+'%';$('term-'+lane+'-'+term).textContent=value.toFixed(1);}
  $('u-'+lane).textContent=s.u.toFixed(1);$('limit-'+lane).textContent=s.saturated?'ถึงขีดจำกัด ±60':'';
  const points=state.history.map(v=>[60+v.t/20*810,124-v[lane]/180*96]);$('trace-'+lane).setAttribute('d',points.map((p,i)=>(i?'L':'M')+p.join(' ')).join(' '));const endPoint=points[points.length-1];$('dot-'+lane).setAttribute('cx',endPoint[0]);$('dot-'+lane).setAttribute('cy',endPoint[1]);
 }
 $('clock').textContent=state.time.toFixed(2)+' / 20 s';$('play').textContent=playing?'หยุดพัก':'เล่นเปรียบเทียบ';$('step').disabled=playing||state.done;$('play').disabled=state.done;
 $('status').textContent=state.done?'ครบ 20 s · กดเริ่มใหม่เพื่อเล่นซ้ำ':playing?'กำลังเทียบ · เป้าและแรงรบกวนเดียวกัน':reduced.matches?'โหมดลดการเคลื่อนไหว · ใช้ทีละก้าว หรือกดเล่นเอง':state.ticks>0?'หยุดพัก · กดเล่นต่อ หรือทีละก้าว':'หยุดอยู่ · เริ่มจากทิศเหนือเท่ากัน';
}
function oneStep(){if(playing)return;state=M.stepRun(state);render();}
$('step').addEventListener('click',oneStep);
window.HeadingLab={snapshot:()=>JSON.parse(JSON.stringify({...state,playing,activeLoop:raf===null?0:1,reduced:reduced.matches})),oneStep,render};
render();
function syncControls(){
 $('target').value=state.config.target;$('target-value').textContent=state.config.target+'°';$('wind').value=state.config.wind;$('wind-value').textContent=state.config.wind.toString();
 for(const lane of ['a','b']){for(const term of ['p','i','d']){$('gain-'+lane+'-'+term).value=state.config[lane][term];$('value-'+lane+'-'+term).textContent=state.config[lane][term].toFixed(2);}
  let name='กำหนดเอง';for(const button of document.querySelectorAll(`.presets[data-lane=${lane}] button`)){const preset=M.PRESETS[button.dataset.preset],match=['p','i','d'].every(k=>preset[k]===state.config[lane][k]);button.setAttribute('aria-pressed',String(match));if(match)name=button.textContent;}$('name-'+lane).textContent=name;
 }
}
function configure(next){playing=false;if(raf!==null)cancelAnimationFrame(raf);raf=null;last=null;accumulator=0;state=M.createRun(next);render();syncControls();}
for(const key of ['target','wind'])$(key).addEventListener('input',event=>configure({...state.config,[key]:Number(event.target.value)}));
syncControls();
for(const lane of ['a','b']){
 for(const term of ['p','i','d'])$('gain-'+lane+'-'+term).addEventListener('input',event=>configure({...state.config,[lane]:{...state.config[lane],[term]:Number(event.target.value)}}));
 for(const button of document.querySelectorAll(`.presets[data-lane=${lane}] button`))button.addEventListener('click',()=>configure({...state.config,[lane]:{...M.PRESETS[button.dataset.preset]}}));
}
for(const lane of ['a','b']){
 const dial=$('dial-'+lane);let dragging=false;
 const pointTarget=event=>{const inv=dial.getScreenCTM().inverse(),p=new DOMPoint(event.clientX,event.clientY).matrixTransform(inv),dx=p.x-150,dy=p.y-150;if(Math.hypot(dx,dy)<18)return;const bearing=Math.round(((Math.atan2(dx,-dy)*180/Math.PI)%360+360)%360)%360;configure({...state.config,target:bearing});};
 dial.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();dragging=true;dial.setPointerCapture(event.pointerId);pointTarget(event);});
 dial.addEventListener('pointermove',event=>{if(dragging)pointTarget(event);});
 dial.addEventListener('pointerup',()=>{dragging=false;});dial.addEventListener('pointercancel',()=>{dragging=false;});
}
$('replay').addEventListener('click',()=>{playing=false;if(raf!==null)cancelAnimationFrame(raf);raf=null;last=null;accumulator=0;state=M.resetRun(state);render();syncControls();});
function frame(now){
 raf=null;if(!playing)return;
 if(last===null)last=now;accumulator+=Math.min(.1,Math.max(0,(now-last)/1000));last=now;
 while(accumulator>=.05&&!state.done){state=M.stepRun(state);accumulator-=.05;}
 if(state.done){playing=false;last=null;accumulator=0;}render();if(playing)raf=requestAnimationFrame(frame);
}
function setPlaying(on){if(on===playing||on&&state.done)return;playing=on;last=null;accumulator=0;if(raf!==null)cancelAnimationFrame(raf);raf=null;if(playing)raf=requestAnimationFrame(frame);render();}
$('play').addEventListener('click',()=>setPlaying(!playing));
document.addEventListener('visibilitychange',()=>{if(document.hidden)setPlaying(false);});
reduced.addEventListener('change',()=>{if(reduced.matches)setPlaying(false);render();});
window.addEventListener('pagehide',()=>setPlaying(false));
// NEXT
})();
