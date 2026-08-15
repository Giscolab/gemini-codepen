const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeEvent {
  constructor() {
    this.listeners = new Set();
  }

  addListener(listener) {
    this.listeners.add(listener);
  }

  async emit(payload) {
    await Promise.all([...this.listeners].map((listener) => listener(payload)));
  }
}

function loadBackground({ fetchImpl, tabsSendMessage } = {}) {
  let connectListener;
  const chrome = {
    runtime: {
      onConnect: {
        addListener(listener) {
          connectListener = listener;
        }
      },
      onMessage: new FakeEvent()
    },
    tabs: {
      sendMessage: tabsSendMessage || (async () => ({ success: true }))
    }
  };

  const source = readFileSync(path.resolve(__dirname, '..', 'background.js'), 'utf8');
  vm.runInNewContext(source, {
    AbortController,
    chrome,
    clearTimeout,
    fetch: fetchImpl || (async () => {
      throw new Error('Unexpected fetch');
    }),
    console,
    setTimeout
  }, { filename: 'background.js' });

  const port = {
    messages: [],
    onMessage: new FakeEvent(),
    onDisconnect: new FakeEvent(),
    postMessage(message) {
      this.messages.push(message);
    }
  };
  connectListener(port);

  return port;
}

test('editor read failures preserve the request ID', async () => {
  const port = loadBackground({
    tabsSendMessage: async () => ({ success: false, error: 'editors not ready' })
  });

  await port.onMessage.emit({
    type: 'GET_CODE',
    requestId: 'code-1',
    tabId: 42
  });

  assert.equal(port.messages[0].type, 'ERROR');
  assert.equal(port.messages[0].requestId, 'code-1');
  assert.match(port.messages[0].error, /editors not ready/);
});

test('successful editor updates are acknowledged with the request ID', async () => {
  const port = loadBackground({
    tabsSendMessage: async () => ({ success: true })
  });

  await port.onMessage.emit({
    type: 'UPDATE_CODE',
    requestId: 'update-1',
    tabId: 42,
    editor: 'css',
    code: 'body {}',
    changedLines: [0]
  });

  assert.deepEqual(JSON.parse(JSON.stringify(port.messages)), [{
    type: 'UPDATE_RESULT',
    requestId: 'update-1',
    success: true
  }]);
});

test('non-JSON provider failures remain readable and correlated', async () => {
  const port = loadBackground({
    fetchImpl: async () => ({
      ok: false,
      status: 502,
      text: async () => 'upstream gateway unavailable'
    })
  });

  await port.onMessage.emit({
    type: 'CALL_MODEL',
    requestId: 'model-1',
    model: 'gpt-4o',
    apiKey: 'test-key',
    systemPrompt: 'system',
    messages: [{ role: 'user', content: 'hello' }]
  });

  assert.equal(port.messages[0].type, 'ERROR');
  assert.equal(port.messages[0].requestId, 'model-1');
  assert.match(port.messages[0].error, /upstream gateway unavailable/);
});
