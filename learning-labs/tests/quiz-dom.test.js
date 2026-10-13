'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Quiz = require('../site/quiz-model.js');
const Adapter = require('../site/learn.js');

function harness() {
  const ids = ['quiz-prompt','quiz-counter','quiz-feedback','quiz-next','quiz-retry','quiz-replay','quiz-answer-0','quiz-answer-1','quiz-answer-2','ms-stage'];
  const elements = Object.fromEntries(ids.map(id => [id, element(id)]));
  elements['quiz-next'].hidden = true;
  elements['quiz-retry'].hidden = true;
  elements['ms-stage'].textContent = '01 / 08';
  return { getElementById: id => elements[id] || null, elements };
}
function element(id) {
  const handlers = {};
  const attributes = {};
  const node = {
    id, textContent: '', hidden: false, disabled: false,
    addEventListener: (type, fn) => { handlers[type] = fn; },
    removeEventListener: type => { delete handlers[type]; },
    setAttribute: (name, value) => { attributes[name] = String(value); },
    getAttribute: name => attributes[name] || null,
  };
  node.click = () => { if (!node.disabled && handlers.click) handlers.click({ target: node }); };
  return node;
}

test('DOM adapter renders the first question as answer buttons', () => {
  const doc = harness();
  Adapter.install(doc, Quiz);
  assert.match(doc.elements['quiz-prompt'].textContent, /HOME/);
  assert.equal(doc.elements['quiz-answer-0'].textContent, 'ออกเดินทางไป WP1 ทันที');
  assert.equal(doc.elements['quiz-answer-1'].textContent, 'รออยู่ที่เดิมจนเงื่อนไขครบ');
  assert.equal(doc.elements['quiz-answer-1'].disabled, false);
});

test('wrong choice gives live feedback and a retry without advancing the story', () => {
  const doc = harness();
  Adapter.install(doc, Quiz);
  doc.elements['quiz-answer-0'].click();
  assert.equal(doc.elements['quiz-feedback'].getAttribute('data-kind'), 'incorrect');
  assert.match(doc.elements['quiz-feedback'].textContent, /HOME/);
  assert.equal(doc.elements['quiz-retry'].hidden, false);
  assert.equal(doc.elements['ms-stage'].textContent, '01 / 08');
  doc.elements['quiz-retry'].click();
  assert.equal(doc.elements['quiz-answer-1'].disabled, false);
  assert.equal(doc.elements['quiz-prompt'].textContent, Quiz.QUESTIONS[0].prompt);
});

test('correct choice advances only by Next and replay stays independent', () => {
  const doc = harness();
  Adapter.install(doc, Quiz);
  doc.elements['quiz-answer-1'].click();
  assert.equal(doc.elements['quiz-next'].hidden, false);
  doc.elements['quiz-next'].click();
  assert.match(doc.elements['quiz-prompt'].textContent, /WP3/);
  doc.elements['quiz-answer-1'].click();
  assert.match(doc.elements['quiz-feedback'].textContent, /WP4/);
  doc.elements['quiz-replay'].click();
  assert.match(doc.elements['quiz-prompt'].textContent, /HOME/);
  assert.equal(doc.elements['ms-stage'].textContent, '01 / 08');
});


test('question indicator follows deliberate progression', () => {
  const doc = harness();
  Adapter.install(doc, Quiz);
  assert.equal(doc.elements['quiz-counter'].textContent, '1 / 2');
  doc.elements['quiz-answer-1'].click();
  doc.elements['quiz-next'].click();
  assert.equal(doc.elements['quiz-counter'].textContent, '2 / 2');
});
