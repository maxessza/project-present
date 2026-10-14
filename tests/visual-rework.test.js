const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../pages/overall.html'),'utf8');
test('PWM physical response uses a directional arrow rather than a diamond and marker size is stroke-independent',()=>{
 const svg=html.match(/<svg class="ov-pid-flow"[\s\S]*?<\/svg>/)[0];
 assert.match(svg,/data-motion-yaw-arrow/,'the boat-response graphic must explicitly be a directional arrow');
 assert.match(svg,/markerUnits="userSpaceOnUse"/,'arrow heads must not enlarge with stroke width');
 assert.doesNotMatch(svg,/M211 199 L225 212 L211 225 L197 212 Z/,'diamond is not a directional boat arrow');
});
