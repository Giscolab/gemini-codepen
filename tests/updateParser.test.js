const assert = require('node:assert/strict');
const {
  extractUpdateBlocks,
  parseSearchReplaceSections,
  stripUpdateBlocks,
  normalizeBlockText
} = require('../js/updateParser.js');

function testStrictFormat() {
  const response = `J'ai fait la modification.\n\n[UPDATE_CSS]\n<<<SEARCH>>>\nbody {\n  background: red;\n}\n<<<REPLACE>>>\nbody {\n  background: blue;\n}\n[/UPDATE_CSS]`;

  const blocks = extractUpdateBlocks(response);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].marker, 'UPDATE_CSS');

  const sections = parseSearchReplaceSections(blocks[0].content);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].searchText, 'body {\n  background: red;\n}');
  assert.equal(sections[0].replaceText, 'body {\n  background: blue;\n}');
}

function testLooseCaseSpacingAndFence() {
  const response = `Update done\n\n[ update_html ]\n\n\
\`\`\`html\n<<<search>>>\n<div>Old</div>\n<<<replace>>>\n<div>New</div>\n\`\`\`\n\n[ /update_html ]`;

  const blocks = extractUpdateBlocks(response);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].marker, 'UPDATE_HTML');

  const sections = parseSearchReplaceSections(blocks[0].content);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].searchText, '<div>Old</div>');
  assert.equal(sections[0].replaceText, '<div>New</div>');
}

function testMultipleBlocksAndStrip() {
  const response = `Done\n[UPDATE_JS]\n<<<SEARCH>>>\nconst a = 1;\n<<<REPLACE>>>\nconst a = 2;\n[/UPDATE_JS]\nAnd\n[UPDATE_CSS]\n<<<SEARCH>>>\nbody{}\n<<<REPLACE>>>\nbody{color:white;}\n[/UPDATE_CSS]`;

  const blocks = extractUpdateBlocks(response);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks.map((b) => b.marker), ['UPDATE_JS', 'UPDATE_CSS']);
  assert.equal(stripUpdateBlocks(response), 'Done\n\nAnd');
}

function testMissingSearchReplacePolicySignal() {
  const response = `[UPDATE_JS]\nconsole.log('full block');\n[/UPDATE_JS]`;
  const blocks = extractUpdateBlocks(response);
  assert.equal(blocks.length, 1);
  const sections = parseSearchReplaceSections(blocks[0].content);
  assert.equal(sections.length, 0, 'UPDATE block without SEARCH/REPLACE should be detectable as invalid');
}

function testNormalizeBlockTextFenceOnly() {
  const fenced = '```css\nbody { color: red; }\n```';
  assert.equal(normalizeBlockText(fenced), 'body { color: red; }');
}

testStrictFormat();
testLooseCaseSpacingAndFence();
testMultipleBlocksAndStrip();
testMissingSearchReplacePolicySignal();
testNormalizeBlockTextFenceOnly();

console.log('All updateParser tests passed.');
