const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backgroundSource = readFileSync(path.join(root, 'background.js'), 'utf8');
const panelSource = readFileSync(path.join(root, 'panel.js'), 'utf8');
const panelHtml = readFileSync(path.join(root, 'panel.html'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));

function extractObjectKeys(source, declarationName) {
  const pattern = new RegExp(`const ${declarationName} = \\{([\\s\\S]*?)\\n\\};`);
  const match = source.match(pattern);
  assert.ok(match, `Unable to find ${declarationName}`);
  return [...match[1].matchAll(/^\s*'([^']+)':/gm)].map((entry) => entry[1]).sort();
}

function extractOptionValues(html) {
  return [...html.matchAll(/<option\s+value=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/g)]
    .map((entry) => entry[1] || entry[2] || entry[3])
    .sort();
}

test('panel model configuration matches every visible option', () => {
  assert.deepEqual(
    extractObjectKeys(panelSource, 'MODEL_CONFIG'),
    extractOptionValues(panelHtml)
  );
});

test('background catalog matches every cloud option', () => {
  const cloudOptions = extractOptionValues(panelHtml)
    .filter((model) => !model.startsWith('local-'))
    .sort();

  assert.deepEqual(extractObjectKeys(backgroundSource, 'MODEL_ENDPOINTS'), cloudOptions);
});

test('manifest host permissions cover every background HTTPS host', () => {
  const referencedHosts = new Set(
    [...backgroundSource.matchAll(/https:\/\/([a-z0-9.-]+)/gi)].map((entry) => entry[1])
  );
  const allowedHostPatterns = manifest.host_permissions.map((permission) => (
    permission.replace(/^https:\/\//, '').replace(/\/\*$/, '')
  ));

  for (const host of referencedHosts) {
    const isAllowed = allowedHostPatterns.some((pattern) => {
      if (pattern.startsWith('*.')) {
        const baseHost = pattern.slice(2);
        return host === baseHost || host.endsWith(`.${baseHost}`);
      }
      return host === pattern;
    });

    assert.equal(isAllowed, true, `Missing host permission for ${host}`);
  }
});
