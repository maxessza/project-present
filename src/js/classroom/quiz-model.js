(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LearnQuizModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const QUESTIONS = Object.freeze([
    Object.freeze({
      prompt: 'GPS และเส้นทางพร้อมแล้ว แต่ยังไม่ได้กำหนด HOME แล้วได้รับ START เรือควรทำอย่างไร?',
      correct: 'wait',
      explanation: 'ยังรออยู่ที่เดิม เพราะ HOME ยังไม่พร้อม คำสั่ง START อย่างเดียวไม่พอให้ออกเดินทาง',
      choices: Object.freeze([
        Object.freeze({ value: 'depart', label: 'ออกเดินทางไป WP1 ทันที' }),
        Object.freeze({ value: 'wait', label: 'รออยู่ที่เดิมจนเงื่อนไขครบ' }),
        Object.freeze({ value: 'rth', label: 'กลับ HOME ทันที' })
      ])
    }),
    Object.freeze({
      prompt: 'หลังผ่าน WP3 ในแผนผังตัวอย่างนี้ ลำดับถัดไปคือจุดใด?',
      correct: 'wp4',
      explanation: 'ลำดับตัวอย่างกวาดลง–ขึ้น–ลง จึงข้ามไป WP4 ที่แนวกลางด้านล่าง',
      choices: Object.freeze([
        Object.freeze({ value: 'wp6', label: 'WP6 · แนวกลางด้านบน' }),
        Object.freeze({ value: 'wp4', label: 'WP4 · แนวกลางด้านล่าง' }),
        Object.freeze({ value: 'wp9', label: 'WP9 · แนวไกลฝั่งด้านล่าง' })
      ])
    })
  ]);
  function createState() { return { index: 0, status: 'unanswered', selected: null, feedback: '' }; }
  function answer(state, value) {
    const question = QUESTIONS[state.index];
    if (!question || state.status === 'correct' || state.status === 'complete') return state;
    const choice = question.choices.find(item => item.value === value);
    if (!choice) return state;
    const correct = value === question.correct;
    return Object.assign({}, state, {
      selected: value,
      status: correct ? 'correct' : 'incorrect',
      feedback: correct ? `ถูกต้อง · ${question.explanation}` : `ลองอีกครั้ง · ${question.explanation}`
    });
  }
  function next(state) {
    if (state.status !== 'correct') return state;
    if (state.index >= QUESTIONS.length - 1) return Object.assign({}, state, { status: 'complete', feedback: 'ครบทั้ง 2 ข้อแล้ว · ทบทวนคำตอบได้โดยเริ่มคำถามใหม่' });
    return { index: state.index + 1, status: 'unanswered', selected: null, feedback: '' };
  }
  return Object.freeze({ QUESTIONS, createState, answer, next });
});



