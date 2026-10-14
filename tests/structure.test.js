'use strict';
const test=require('node:test'); const assert=require('node:assert/strict');
const fs=require('node:fs'); const path=require('node:path'); const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');const text=f=>fs.readFileSync(path.join(root,f),'utf8');
test('one start page links to all nine teaching/project topics',()=>{
 const wanted=['pages/classroom.html','pages/story.html','pages/heading-pid.html','pages/overall.html#ms-uplink-panel','pages/overall.html','pages/waypoints.html','pages/sensors.html','pages/heatmap.html','pages/slides.html'];
 for(const link of wanted)assert.ok(text('index.html').includes('href="'+link+'"'),link);
 assert.equal(fs.existsSync(path.join(root,'learning-labs')),false);
 assert.deepEqual(fs.readdirSync(root).filter(f=>/\.(html|js|css)$/.test(f)),['index.html']);
});
test('every active chapter returns to the same project entry',()=>{
 const pages=fs.readdirSync(path.join(root,'pages')).filter(f=>f.endsWith('.html'));
 assert.equal(pages.length,8);
 for(const f of pages)assert.ok(text('pages/'+f).includes('href="../index.html"'),f);
});
test('migration map accounts for source files and binds their current bytes',()=>{
 const rows=JSON.parse(text('docs/MIGRATION_MAP.json')).records;
 assert.equal(rows.length,39); assert.equal(new Set(rows.map(x=>x.new_path)).size,rows.length);
 for(const row of rows)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,row.new_path))).digest('hex'),row.output_sha256,row.new_path);
 assert.equal(rows.find(x=>x.old_path==='mission-start.html').new_path,'docs/legacy/mission-start-fragment.html');
});
