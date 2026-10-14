const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
test('PWM teaching caption explicitly scopes base plus/minus correction to forward mixing, not turn in place',()=>{
 const h=fs.readFileSync(path.join(__dirname,'../pages/overall.html'),'utf8');const z=h.indexOf('id="ov-pid-flow"');const panel=h.slice(h.lastIndexOf('<article',z),h.indexOf('</article>',z));
 assert.match(panel,/ตัวอย่างเดินหน้า/,'forward-only example must be explicit');assert.match(panel,/TURN-IN-PLACE/,'separate turn-in-place branch must be named');assert.match(panel,/clamp/);
});
