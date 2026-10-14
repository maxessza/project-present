'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('page has its own arrow identity and avoids a missing favicon request',()=>{const h=fs.readFileSync(path.join(__dirname,'../pages/story.html'),'utf8');assert.doesNotMatch(h.match(/<title>(.*?)<\/title>/s)[1],/🐴/);assert.match(h,/rel="icon"[^>]*data:image\/svg\+xml/);});
