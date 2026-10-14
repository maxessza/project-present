'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
test('reduced motion disables arrow animations and transitions instead of freezing a shrunk SVG transition',()=>{const css=fs.readFileSync(path.join(__dirname,'../src/css/story.css'),'utf8');assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{#story-boat\{transition:none!important;animation:none!important\}/);});
