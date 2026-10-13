(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document && root.LearnQuizModel) {
    root.LearnQuizAdapter = api;
    root.LearnQuizController = api.install(root.document, root.LearnQuizModel);
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  function install(doc, Model) {
    if (!doc || !Model) return null;
    const get = id => doc.getElementById(id);
    const prompt = get('quiz-prompt');
    const counter = get('quiz-counter');
    const feedback = get('quiz-feedback');
    const answers = [0, 1, 2].map(index => get(`quiz-answer-${index}`));
    const next = get('quiz-next');
    const retry = get('quiz-retry');
    const replay = get('quiz-replay');
    if (!prompt || !feedback || answers.some(button => !button) || !next || !retry || !replay) return null;
    let state = Model.createState();
    function render() {
      const question = Model.QUESTIONS[state.index];
      prompt.textContent = question ? question.prompt : 'แบบทดสอบจบแล้ว';
      if (counter) counter.textContent = `${state.index + 1} / ${Model.QUESTIONS.length}`;
      answers.forEach((button, index) => {
        const choice = question && question.choices[index];
        button.hidden = !choice;
        button.disabled = !choice || state.status === 'correct' || state.status === 'complete';
        button.textContent = choice ? choice.label : '';
      });
      feedback.textContent = state.feedback || '';
      feedback.setAttribute('data-kind', state.status);
      next.hidden = state.status !== 'correct';
      retry.hidden = state.status !== 'incorrect';
      replay.hidden = false;
    }
    answers.forEach((button, index) => button.addEventListener('click', () => {
      const question = Model.QUESTIONS[state.index];
      if (question && question.choices[index]) { state = Model.answer(state, question.choices[index].value); render(); }
    }));
    retry.addEventListener('click', () => {
      if (state.status !== 'incorrect') return;
      state = { index: state.index, status: 'unanswered', selected: null, feedback: '' };
      render();
    });
    next.addEventListener('click', () => {
      state = Model.next(state);
      render();
    });
    replay.addEventListener('click', () => {
      state = Model.createState();
      render();
    });
    render();
    return { getSnapshot() { return Object.assign({}, state); } };
  }
  return Object.freeze({ install });
});




