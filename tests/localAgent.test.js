const test = require('node:test');
const assert = require('node:assert/strict');
const LocalAgent = require('../js/agents/LocalAgent.js');

async function withLanguageModel(LanguageModel, callback) {
  const previous = globalThis.LanguageModel;
  globalThis.LanguageModel = LanguageModel;

  try {
    await callback();
  } finally {
    if (previous === undefined) {
      delete globalThis.LanguageModel;
    } else {
      globalThis.LanguageModel = previous;
    }
  }
}

test('runs Chrome AI in the extension document without duplicating the latest prompt', async () => {
  let createOptions;
  let promptArguments;
  let destroyed = false;

  await withLanguageModel({
    availability: async () => 'available',
    create: async (options) => {
      createOptions = options;
      return {
        async prompt(...args) {
          promptArguments = args;
          return 'local response';
        },
        destroy() {
          destroyed = true;
        }
      };
    }
  }, async () => {
    const agent = new LocalAgent();
    const response = await agent.sendMessage('system', [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'latest' }
    ]);

    assert.equal(response, 'local response');
  });

  assert.deepEqual(createOptions.initialPrompts, [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'answer' }
  ]);
  assert.equal(promptArguments[0], 'latest');
  assert.equal(promptArguments[1].signal, createOptions.signal);
  assert.equal(destroyed, true);
});

test('destroys the Chrome AI session when prompting fails', async () => {
  let destroyed = false;

  await withLanguageModel({
    availability: async () => 'available',
    create: async () => ({
      async prompt() {
        throw new Error('prompt failed');
      },
      destroy() {
        destroyed = true;
      }
    })
  }, async () => {
    const agent = new LocalAgent();
    await assert.rejects(
      agent.sendMessage('system', [{ role: 'user', content: 'latest' }]),
      /prompt failed/
    );
  });

  assert.equal(destroyed, true);
});

test('reports when Chrome AI is unavailable', async () => {
  await withLanguageModel({
    availability: async () => 'unavailable'
  }, async () => {
    const agent = new LocalAgent();
    await assert.rejects(
      agent.sendMessage('system', [{ role: 'user', content: 'latest' }]),
      /unavailable on this device/
    );
  });
});

test('aborts a local request after its timeout', async () => {
  await withLanguageModel({
    availability: async () => 'available',
    create: async () => ({
      prompt(content, { signal }) {
        return new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      },
      destroy() {}
    })
  }, async () => {
    const agent = new LocalAgent({ timeout: 10 });
    await assert.rejects(
      agent.sendMessage('system', [{ role: 'user', content: 'latest' }]),
      /Request timeout/
    );
  });
});
