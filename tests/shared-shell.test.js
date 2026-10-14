import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['overall', 'waypoints', 'heatmap', 'sensors', 'slides', 'classroom', 'story', 'heading-pid'];
const topics = [
  'overall.html', 'waypoints.html', 'heatmap.html', 'sensors.html', 'slides.html',
  'classroom.html', 'story.html', 'heading-pid.html', 'overall.html#ms-uplink-panel'
];

test('active pages share the branded shell and expose all nine topics', () => {
  for (const page of pages) {
    const html = readFileSync(path.join(root, 'pages', `${page}.html`), 'utf8');
    assert.match(html, /\.\.\/src\/css\/site\.css/, `${page} must use the canonical site theme`);
    assert.match(html, /class="site-header"/, `${page} must render the shared brand header`);
    assert.match(html, /class="primary-nav"/, `${page} must render the shared primary navigation`);
    for (const topic of topics) {
      assert.ok(html.includes(`href="${topic}"`), `${page} navigation is missing ${topic}`);
    }
    assert.doesNotMatch(html, /project-entry-nav[^]*?href="\.\.\/index\.html"/, `${page} must not route its context breadcrumb back through root`);
  }
});

test('canonical navigation keeps touch targets usable and follows original dark tokens', () => {
  const css = readFileSync(path.join(root, 'src/css/site.css'), 'utf8');
  assert.match(css, /--bg:#06121d/);
  assert.match(css, /--cyan:#25c5d2/);
  assert.match(css, /\.nav-link\{[^}]*min-height:44px/);
  assert.match(css, /:focus-visible/);
});
