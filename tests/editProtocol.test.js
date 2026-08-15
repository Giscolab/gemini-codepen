const assert = require('node:assert/strict');
const test = require('node:test');
const EditProtocol = require('../js/editProtocol.js');

test('requests one repair when Edit mode has no applicable update block', () => {
  assert.equal(
    EditProtocol.needsRepair('edit', { html: true, css: false, js: false }, []),
    true
  );
  assert.equal(
    EditProtocol.needsRepair(
      'edit',
      { html: true, css: false, js: false },
      [{ marker: 'UPDATE_CSS' }]
    ),
    true
  );
});

test('does not repair an applicable response or an Explain-mode response', () => {
  const htmlBlock = [{ marker: 'UPDATE_HTML' }];

  assert.equal(
    EditProtocol.needsRepair('edit', { html: true }, htmlBlock),
    false
  );
  assert.equal(
    EditProtocol.needsRepair('explain', { html: true }, []),
    false
  );
  assert.equal(
    EditProtocol.needsRepair('edit', { html: false, css: false, js: false }, []),
    false
  );
});

test('repair instruction targets only enabled scopes', () => {
  const instruction = EditProtocol.buildRepairMessage({
    html: true,
    css: false,
    js: false
  });

  assert.match(instruction, /\[UPDATE_HTML\]/);
  assert.doesNotMatch(instruction, /\[UPDATE_CSS\]/);
  assert.doesNotMatch(instruction, /\[UPDATE_JS\]/);
  assert.match(instruction, /<<<SEARCH>>>/);
  assert.match(instruction, /<<<REPLACE>>>/);
});
