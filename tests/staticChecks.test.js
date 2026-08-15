const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const firstPartyScripts = [
  'background.js',
  'content.js',
  'devtools.js',
  'inject.js',
  'panel.js',
  'js/codepenEditorAdapter.js',
  'js/agents/Agent.js',
  'js/agents/LocalAgent.js',
  'js/patchEngine.js',
  'js/updateParser.js'
];

for (const relativePath of firstPartyScripts) {
  test(`syntax: ${relativePath}`, () => {
    const result = spawnSync(process.execPath, ['--check', relativePath], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}

test('manifest is valid and references existing local files', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const referencedFiles = [
    manifest.background.service_worker,
    manifest.devtools_page,
    ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap((script) => script.js)
  ];

  for (const relativePath of referencedFiles) {
    assert.equal(existsSync(path.join(root, relativePath)), true, `Missing ${relativePath}`);
  }

  const mainWorldScript = manifest.content_scripts.find((script) => script.world === 'MAIN');
  assert.deepEqual(
    mainWorldScript.js,
    ['js/codepenEditorAdapter.js', 'inject.js'],
    'CodePen 2.0 adapter must load before the main-world bridge'
  );
});

test('browser globals load in panel dependency order', () => {
  const context = vm.createContext({
    clearTimeout,
    console,
    setTimeout
  });
  const scripts = [
    'js/agents/Agent.js',
    'js/agents/LocalAgent.js',
    'js/updateParser.js',
    'js/patchEngine.js'
  ];

  for (const relativePath of scripts) {
    vm.runInContext(
      readFileSync(path.join(root, relativePath), 'utf8'),
      context,
      { filename: relativePath }
    );
  }

  assert.equal(vm.runInContext('typeof Agent', context), 'function');
  assert.equal(vm.runInContext('typeof LocalAgent', context), 'function');
  assert.equal(vm.runInContext('typeof UpdateParser', context), 'object');
  assert.equal(vm.runInContext('typeof PatchEngine', context), 'object');
});
