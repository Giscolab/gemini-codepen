const test = require('node:test');
const assert = require('node:assert/strict');
const { applySearchReplace } = require('../js/patchEngine.js');

function block(marker, searchText, replaceText) {
  return `[${marker}]\n<<<SEARCH>>>\n${searchText}\n<<<REPLACE>>>\n${replaceText}\n[/${marker}]`;
}

test('applies one exact and unique replacement', () => {
  const result = applySearchReplace(
    'const answer = 41;\nconsole.log(answer);',
    block('UPDATE_JS', 'const answer = 41;', 'const answer = 42;'),
    'UPDATE_JS'
  );

  assert.equal(result.code, 'const answer = 42;\nconsole.log(answer);');
  assert.deepEqual(result.lines, [0]);
  assert.deepEqual(result.errors, []);
});

test('applies every block for the same editor in response order', () => {
  const response = [
    block('UPDATE_JS', 'const first = 1;', 'const first = 2;'),
    block('UPDATE_JS', 'const second = 1;', 'const second = 2;')
  ].join('\n');

  const result = applySearchReplace(
    'const first = 1;\nconst second = 1;',
    response,
    'UPDATE_JS'
  );

  assert.equal(result.code, 'const first = 2;\nconst second = 2;');
  assert.deepEqual(result.lines, [0, 1]);
});

test('rejects an ambiguous SEARCH without changing code', () => {
  const result = applySearchReplace(
    '.item { color: red; }\n.item { color: red; }',
    block('UPDATE_CSS', '.item { color: red; }', '.item { color: blue; }'),
    'UPDATE_CSS'
  );

  assert.equal(result.code, null);
  assert.match(result.errors[0], /ambiguous \(2 matches\)/);
});

test('treats overlapping SEARCH occurrences as ambiguous', () => {
  const result = applySearchReplace(
    'aaaa',
    block('UPDATE_JS', 'aaa', 'bbb'),
    'UPDATE_JS'
  );

  assert.equal(result.code, null);
  assert.match(result.errors[0], /ambiguous \(2 matches\)/);
});

test('rejects the complete editor patch when one section is invalid', () => {
  const response = `[UPDATE_JS]
<<<SEARCH>>>
const valid = true;
<<<REPLACE>>>
const valid = false;
<<<SEARCH>>>
const missing = true;
<<<REPLACE>>>
const missing = false;
[/UPDATE_JS]`;

  const result = applySearchReplace('const valid = true;', response, 'UPDATE_JS');

  assert.equal(result.code, null);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /could not find the exact SEARCH text/);
});

test('does not silently relax whitespace in SEARCH text', () => {
  const result = applySearchReplace(
    'function value() {\n  return 1;\n}',
    block('UPDATE_JS', 'function value() {\n    return 1;\n}', 'function value() {\n  return 2;\n}'),
    'UPDATE_JS'
  );

  assert.equal(result.code, null);
  assert.match(result.errors[0], /could not find/);
});

test('appends to an empty editor without a leading blank line', () => {
  const result = applySearchReplace(
    '',
    block('UPDATE_HTML', '', '<main>Hello</main>'),
    'UPDATE_HTML'
  );

  assert.equal(result.code, '<main>Hello</main>');
  assert.deepEqual(result.lines, [0]);
});

test('returns null when the requested marker is absent', () => {
  const result = applySearchReplace(
    'body {}',
    block('UPDATE_JS', 'const a = 1;', 'const a = 2;'),
    'UPDATE_CSS'
  );

  assert.equal(result, null);
});
