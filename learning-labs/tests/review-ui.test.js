'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../site/story.css'),'utf8'),html=fs.readFileSync(path.join(__dirname,'../site/story.html'),'utf8');
test('all chapter and readiness targets meet the44px phone minimum',()=>{assert.match(css,/min-height:44px/);assert.doesNotMatch(css,/min-height:(40|42)px/);});
test('desktop experiment controls are in the bottom full-width row',()=>{assert.match(css,/\.experiment\{grid-column:1;grid-row:5/);});
test('phone diagrams have four bounded scrollable viewports with readable intrinsic size',()=>{assert.equal((html.match(/class="diagram-viewport"/g)||[]).length,4);assert.match(css,/min-width:960px/);});
