const assert = require('node:assert/strict');
const test = require('node:test');
const adapter = require('../js/codepenEditorAdapter.js');

test('classifies default and preprocessed CodePen 2.0 files', () => {
  assert.equal(adapter.classifyFilePath('/index.pen.html'), 'html');
  assert.equal(adapter.classifyFilePath('/pages/about.pug'), 'html');
  assert.equal(adapter.classifyFilePath('/styles/site.scss'), 'css');
  assert.equal(adapter.classifyFilePath('/src/App.tsx'), 'js');
  assert.equal(adapter.classifyFilePath('/package.json'), null);
});

test('extracts file paths from CodePen labels and attributes', () => {
  assert.deepEqual(
    adapter.extractFilePaths([
      'Code editor for /index.pen.html',
      'Current file: /styles/style.css',
      'Open /src/App.tsx'
    ]),
    ['/index.pen.html', '/styles/style.css', '/src/app.tsx']
  );
});

test('selects the standard primary file for each legacy scope', () => {
  const candidates = [
    { id: 'component', paths: ['/src/component.js'], active: false },
    { id: 'script', paths: ['/script.js'], active: false },
    { id: 'html', paths: ['/index.pen.html'], active: false }
  ];

  assert.equal(adapter.selectEditorCandidate(candidates, 'js').id, 'script');
  assert.equal(adapter.selectEditorCandidate(candidates, 'html').id, 'html');
});

test('prefers the file selected in the CodePen URL', () => {
  const candidates = [
    { id: 'component', paths: ['/src/component.js'], active: false },
    { id: 'script', paths: ['/script.js'], active: false }
  ];

  assert.equal(
    adapter.selectEditorCandidate(candidates, 'js', '/src/component.js').id,
    'component'
  );
});

test('rejects an ambiguous choice instead of writing the wrong file', () => {
  const candidates = [
    { id: 'one', paths: ['/src/one.js'], active: false },
    { id: 'two', paths: ['/src/two.js'], active: false }
  ];

  assert.equal(adapter.selectEditorCandidate(candidates, 'js'), null);
});

test('uses the URL type when CodePen mounts one unlabeled editor', () => {
  const onlyEditor = { id: 'active', paths: [], active: true };

  assert.equal(
    adapter.selectEditorCandidate([onlyEditor], 'css', '/style.css'),
    onlyEditor
  );
  assert.equal(adapter.selectEditorCandidate([onlyEditor], 'js', '/style.css'), null);
});

test('reads the active file from a CodePen 2.0 URL', () => {
  assert.equal(
    adapter.getCurrentFilePath('https://codepen.io/user/pen/editor/id?file=%2Fsrc%2FApp.tsx'),
    '/src/app.tsx'
  );
});
