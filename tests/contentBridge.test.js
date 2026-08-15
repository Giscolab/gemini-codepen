const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadContentBridge() {
  const scheduled = [];
  const postedMessages = [];
  const windowListeners = new Map();
  let runtimeListener;
  let timerId = 0;

  const window = {
    addEventListener(type, listener) {
      windowListeners.set(type, listener);
    },
    postMessage(message) {
      postedMessages.push(message);
    }
  };
  window.top = window;

  const context = vm.createContext({
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            runtimeListener = listener;
          }
        },
        sendMessage() {
          return Promise.resolve();
        }
      }
    },
    clearTimeout(id) {
      const timer = scheduled.find((candidate) => candidate.id === id);
      if (timer) timer.cancelled = true;
    },
    console: {
      ...console,
      debug() {}
    },
    document: {
      readyState: 'complete'
    },
    Error,
    location: {
      href: 'https://codepen.io/editor/user/pen/id'
    },
    setTimeout(callback, delay) {
      timerId += 1;
      scheduled.push({ id: timerId, callback, delay, cancelled: false });
      return timerId;
    },
    window
  });

  vm.runInContext(
    readFileSync(path.join(root, 'content.js'), 'utf8'),
    context,
    { filename: 'content.js' }
  );

  return {
    getRuntimeListener: () => runtimeListener,
    getWindowListener: () => windowListeners.get('message'),
    getPostedMessages: () => postedMessages,
    respond(message) {
      windowListeners.get('message')({
        source: window,
        data: {
          source: 'chrome-code-inject',
          ...message
        }
      });
    },
    takeTimer(delay) {
      const index = scheduled.findIndex((timer) => !timer.cancelled && timer.delay === delay);
      if (index < 0) return null;
      return scheduled.splice(index, 1)[0];
    }
  };
}

test('retries the readiness probe after a transient MAIN-world timeout', async () => {
  const bridge = loadContentBridge();
  const initialProbe = bridge.takeTimer(1000);
  assert.ok(initialProbe);

  const probePromise = initialProbe.callback();
  await Promise.resolve();

  const bridgeTimeout = bridge.takeTimer(2000);
  assert.ok(bridgeTimeout);
  bridgeTimeout.callback();
  await probePromise;

  assert.ok(bridge.takeTimer(1000), 'a new readiness probe should be scheduled');
});

test('returns the precise MAIN-world error to the background request', async () => {
  const bridge = loadContentBridge();
  const runtimeListener = bridge.getRuntimeListener();
  const responsePromise = new Promise((resolve) => {
    runtimeListener({ type: 'GET_CODE' }, {}, resolve);
  });

  const request = bridge.getPostedMessages().find((message) => message.action === 'getAllCode');
  assert.ok(request);
  bridge.respond({
    id: request.id,
    error: 'Impossible de lire l’éditeur CSS de CodePen 2.0'
  });

  const response = await responsePromise;
  assert.equal(response.success, false);
  assert.equal(response.error, 'Impossible de lire l’éditeur CSS de CodePen 2.0');
});
