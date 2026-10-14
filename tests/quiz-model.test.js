'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Quiz = require('../src/js/classroom/quiz-model.js');

test('checkpoint asks exactly the two intended questions in order', () => {
  assert.equal(Quiz.QUESTIONS.length, 2);
  assert.match(Quiz.QUESTIONS[0].prompt, /HOME/);
  assert.equal(Quiz.QUESTIONS[0].correct, 'wait');
  assert.match(Quiz.QUESTIONS[1].prompt, /WP3/);
  assert.equal(Quiz.QUESTIONS[1].correct, 'wp4');
});

test('wrong answers explain the blocked start and can be retried without advancing', () => {
  let state = Quiz.createState();
  state = Quiz.answer(state, 'depart');
  assert.equal(state.index, 0);
  assert.equal(state.status, 'incorrect');
  assert.match(state.feedback, /HOME/);
  state = Quiz.answer(state, 'wait');
  assert.equal(state.status, 'correct');
  assert.match(state.feedback, /รอ/);
});

test('a correct answer advances only on Next and the second answer is WP4', () => {
  let state = Quiz.answer(Quiz.createState(), 'wait');
  assert.equal(state.index, 0);
  state = Quiz.next(state);
  assert.equal(state.index, 1);
  state = Quiz.answer(state, 'wp4');
  assert.equal(state.status, 'correct');
  assert.match(state.feedback, /WP4/);
});
