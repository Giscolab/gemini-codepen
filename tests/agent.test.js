const test = require('node:test');
const assert = require('node:assert/strict');
const Agent = require('../js/agents/Agent.js');

class FakeEvent {
  constructor() {
    this.listeners = new Set();
  }

  addListener(listener) {
    this.listeners.add(listener);
  }

  removeListener(listener) {
    this.listeners.delete(listener);
  }

  emit(payload) {
    for (const listener of [...this.listeners]) listener(payload);
  }
}

function createPort() {
  const sentMessages = [];
  return {
    sentMessages,
    onMessage: new FakeEvent(),
    onDisconnect: new FakeEvent(),
    postMessage(message) {
      sentMessages.push(message);
    }
  };
}

function createAgent(port, timeout = 100) {
  const agent = new Agent({
    apiKey: 'test-key',
    responseType: 'MODEL_RESPONSE',
    callType: 'CALL_MODEL',
    timeout
  });
  agent.model = 'test-model';
  agent.setBackgroundPort(port);
  return agent;
}

test('correlates a model response with its request ID', async () => {
  const port = createPort();
  const agent = createAgent(port);
  const responsePromise = agent.sendMessage('system', [{ role: 'user', content: 'hello' }]);
  const request = port.sentMessages[0];

  assert.match(request.requestId, /^agent-/);
  assert.equal(request.type, 'CALL_MODEL');

  port.onMessage.emit({
    type: 'ERROR',
    requestId: 'another-request',
    error: 'must be ignored'
  });
  port.onMessage.emit({
    type: 'MODEL_RESPONSE',
    requestId: request.requestId,
    response: 'ok'
  });

  assert.equal(await responsePromise, 'ok');
  assert.equal(port.onMessage.listeners.size, 0);
  assert.equal(port.onDisconnect.listeners.size, 0);
});

test('rejects only the matching background error', async () => {
  const port = createPort();
  const agent = createAgent(port);
  const responsePromise = agent.sendMessage('system', [{ role: 'user', content: 'hello' }]);
  const requestId = port.sentMessages[0].requestId;

  port.onMessage.emit({ type: 'ERROR', requestId, error: 'provider failed' });

  await assert.rejects(responsePromise, /provider failed/);
  assert.equal(port.onMessage.listeners.size, 0);
});

test('cleans listeners after a timeout', async () => {
  const port = createPort();
  const agent = createAgent(port, 10);

  await assert.rejects(
    agent.sendMessage('system', [{ role: 'user', content: 'hello' }]),
    /Request timeout/
  );
  assert.equal(port.onMessage.listeners.size, 0);
  assert.equal(port.onDisconnect.listeners.size, 0);
});

test('rejects immediately when the runtime port disconnects', async () => {
  const port = createPort();
  const agent = createAgent(port);
  const responsePromise = agent.sendMessage('system', [{ role: 'user', content: 'hello' }]);

  port.onDisconnect.emit();

  await assert.rejects(responsePromise, /Connection lost/);
  assert.equal(agent.isPortConnected, false);
});
