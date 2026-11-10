const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.join(__dirname, '..');
const matrixPath = path.join(ROOT, 'docs', 'OVERALL_REQUIREMENTS_MATRIX.json');
const requirements = [
  ['C1', 'SOURCE/COVERAGE'], ['C2', 'ROUTE/COMMANDS'], ['C3', 'GRID'],
  ['C4', 'SPIRAL GENERATION'], ['C5', 'SPIRAL PROGRESSION'],
  ['C6', 'ANOMALY/FSM/SAFETY'], ['C7', 'CONTROL/DRIVE'],
  ['C8', 'SAMPLING/SENSORS'], ['C9', 'HOME/RTH'], ['C10', 'DATA/LOG'],
  ['C11', 'NATIVE UI'], ['C12', 'PRESERVATION/REVIEW'],
];
const load = () => JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
const resolve = p => path.isAbsolute(p) ? p : path.join(ROOT, p);
const digest = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function checkReview(matrix) {
  const gate = matrix.review_gate;
  assert.ok(gate && ['PENDING', 'PASS', 'FAIL', 'NOT_VERIFIED'].includes(gate.state), 'explicit independent review gate required');
  const c12 = matrix.requirements.find(row => row.id === 'C12');
  if (gate.state !== 'PASS') {
    assert.ok(['pending_review', 'not_verified'].includes(c12.status));
    assert.doesNotMatch(matrix.independent_review, /^PASS/);
    return;
  }
  assert.ok(gate.artifact && fs.existsSync(resolve(gate.artifact)), 'independent final PASS artifact required');
  const artifact = JSON.parse(fs.readFileSync(resolve(gate.artifact), 'utf8'));
  assert.equal(artifact.verdict, 'PASS', 'independent final PASS artifact required');
  assert.equal(artifact.review_role, 'independent_verifier', 'review must be independent, not builder progress');
  assert.equal(artifact.model, 'gpt-6-astra');
  assert.equal(artifact.effort, 'high');
  assert.equal(artifact.task_id, gate.task_id);
  assert.equal(artifact.run_id, gate.run_id);
  assert.ok(Number.isInteger(artifact.run_id) && artifact.run_id > 0);
  assert.equal(digest(resolve(gate.artifact)), gate.sha256, 'review artifact bytes changed');
  assert.equal(c12.status, 'verified_host');
  assert.match(matrix.independent_review, /^PASS/);
  for (const key of ['src/js/overall/autonomous-mission.js', 'src/js/overall/mission-kernel.js', 'src/js/overall/firmware-policy.js']) {
    assert.ok(gate.runtime_sha256 && /^[a-f0-9]{64}$/.test(gate.runtime_sha256[key] || ''), 'review must bind actual runtime sources');
  }
  for (const [file, sha] of Object.entries(gate.runtime_sha256)) assert.equal(digest(resolve(file)), sha, `reviewed runtime drift: ${file}`);
}

test('current requirements matrix preserves the original C1-C12 identifiers and names', () => {
  assert.ok(fs.existsSync(matrixPath), 'current corrected matrix must be maintained with the docs');
  const matrix = load();
  assert.deepEqual(matrix.requirements.map(({id, name}) => [id, name]), requirements);
  assert.equal(matrix.requirements.length, 12);
  assert.ok(matrix.requirements.every(row => ['partial', 'not_verified', 'pending_review', 'host_checked', 'verified_host'].includes(row.status)));
  assert.ok(matrix.requirements.every(row => Array.isArray(row.confirmed) && Array.isArray(row.unknown) && Array.isArray(row.excluded) && Array.isArray(row.evidence)));
  const byId = Object.fromEntries(matrix.requirements.map(row => [row.id, row]));
  assert.equal(byId.C3.name, 'GRID');
  assert.equal(byId.C4.name, 'SPIRAL GENERATION');
  checkReview(matrix);
});

test('every criterion has real resolvable evidence, not missing reports or fake anchors', () => {
  const missing = [];
  for (const row of load().requirements) {
    assert.ok(row.evidence.length > 0, `${row.id}: no evidence pointers`);
    for (const pointer of row.evidence) {
      const file = pointer.split('::')[0].split('#')[0];
      if (!fs.existsSync(resolve(file))) missing.push(`${row.id}: ${pointer}`);
    }
  }
  assert.deepEqual(missing, [], 'every evidence pointer must resolve to an actual artifact');
});

test('builder progress cannot be promoted into an independent approval', () => {
  const forged = load();
  const builder = 'D:/Presention/presention-current-grid-ui-20261023/overall-firmware-parity/closure-20261029-231008/builder/LEDGER.json';
  forged.review_gate = {state:'PASS', artifact:builder, sha256:digest(builder), runtime_sha256:{}};
  assert.throws(() => checkReview(forged), /independent final PASS artifact required/);
});
