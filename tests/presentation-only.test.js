'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
test('Classroom is presentation-only: no quiz, checkpoint or prediction UI/resources',()=>{
 const html=fs.readFileSync(path.join(root,'pages/classroom.html'),'utf8');
 assert.doesNotMatch(html,/learn-quiz|quiz-(?:prompt|answer|feedback)|learning-checkpoint|learn-checkpoint-link|learn-coach-note|quiz-model\.js|classroom\/learn\.js|เช็กความเข้าใจ|ลองทาย|ทายให้/);
 assert.match(html,/id="ms-play"/);assert.match(html,/id="ms-ready-home"/);assert.match(html,/mission-start-model\.js/);assert.match(html,/mission-start\.js/);
});

test('active pages and slide copy contain factual presentation labels, not audience questions or narrative read-more blocks',()=>{
 const vm=require('node:vm'),rx=/[?？]|คำถาม|เฉลย|เช็กความเข้าใจ|อ่านต่อ|ลองทาย|ทายให้|แบบทดสอบ|question\b|\bquiz\b/i;
 const plain=s=>s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ');
 const failures=[];
 for(const name of fs.readdirSync(path.join(root,'pages')).filter(n=>n.endsWith('.html'))){
  const html=fs.readFileSync(path.join(root,'pages',name),'utf8');
  if(rx.test(plain(html)))failures.push(name+': question/prompt text');
  if(/sim-firmware-details|ov-legacy-details/.test(html)||name==='heading-pid.html'&&/<details\b/.test(html))failures.push(name+': narrative read-more');
 }
 const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'src/js/slides/slides-data.js'),'utf8'),context);
 const visit=(value,loc)=>{if(typeof value==='string'){if(rx.test(value))failures.push(loc+': question/prompt text');}else if(Array.isArray(value))value.forEach((v,i)=>visit(v,loc+'['+i+']'));else if(value&&typeof value==='object')Object.entries(value).forEach(([k,v])=>visit(v,loc+'.'+k));};visit(context.window.presentationSlides,'slides');
 assert.deepEqual(failures,[]);
});
