const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('DOMPurify vendored version is the audited release', () => {
  const source = fs.readFileSync(path.join(root, 'js/purify.min.js'), 'utf8');

  assert.match(source, /DOMPurify 3\.4\.13\b/);
});

test('Marked vendored version is the audited release', () => {
  const source = fs.readFileSync(path.join(root, 'js/marked.min.js'), 'utf8');

  assert.match(source, /marked v18\.0\.9\b/);
});
