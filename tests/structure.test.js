'use strict';
const test=require('node:test'); const assert=require('node:assert/strict');
const fs=require('node:fs'); const path=require('node:path'); const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');const text=f=>fs.readFileSync(path.join(root,f),'utf8');
test('root entry opens the existing Overall page and preserves location context',()=>{
 const html=text('index.html');
 assert.match(html,/new URL\("pages\/overall\.html",location\.href\)/);
 assert.match(html,/target\.search=location\.search/);
 assert.match(html,/target\.hash=location\.hash/);
 assert.match(html,/location\.replace\(target\.href\)/);
 assert.match(html,/href="pages\/overall\.html"/);
 assert.equal(fs.existsSync(path.join(root,'learning-labs')),false);
 assert.deepEqual(fs.readdirSync(root).filter(f=>/\.(html|js|css)$/.test(f)),['index.html']);
});
test('detailed lessons return to the Overall section that gives them context',()=>{
 assert.ok(text('pages/classroom.html').includes('href="overall.html#mission-start"'));
 assert.ok(text('pages/story.html').includes('href="overall.html#mission-start"'));
 assert.ok(text('pages/heading-pid.html').includes('href="overall.html#pid"'));
});
test('migration map accounts for source files and binds their current bytes',()=>{
 const rows=JSON.parse(text('docs/MIGRATION_MAP.json')).records;
 assert.ok(rows.length>0); assert.equal(new Set(rows.map(x=>x.new_path)).size,rows.length);
 for(const row of rows)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,row.new_path))).digest('hex'),row.output_sha256,row.new_path);
 assert.equal(rows.find(x=>x.old_path==='mission-start.html').new_path,'docs/legacy/mission-start-fragment.html');
});
