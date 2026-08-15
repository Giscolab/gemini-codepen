const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function createEditor(filePath, initialCode) {
  let code = initialCode;
  let editorElement;

  const view = {
    get state() {
      return {
        doc: {
          length: code.length,
          toString: () => code
        }
      };
    },
    dispatch(transaction) {
      code = transaction.changes.insert;
    }
  };

  const contentElement = {
    cmTile: { root: { view } },
    closest(selector) {
      return selector === '.cm-editor' ? editorElement : null;
    },
    getAttribute() {
      return null;
    },
    matches() {
      return false;
    },
    querySelectorAll() {
      return [];
    }
  };

  editorElement = {
    parentElement: null,
    previousElementSibling: null,
    contains(element) {
      return element === contentElement;
    },
    getAttribute(attribute) {
      return attribute === 'data-file-path' ? filePath : null;
    },
    matches(selector) {
      return selector === '.cm-editor';
    },
    querySelector(selector) {
      return selector.includes('.cm-content') ? contentElement : null;
    },
    querySelectorAll(selector) {
      return selector === '*' ? [contentElement] : [];
    }
  };

  return {
    contentElement,
    editorElement,
    getCode: () => code
  };
}

function loadBridge({ classicBoxes = false } = {}) {
  const editors = [
    createEditor('/index.pen.html', '<main>Before</main>'),
    createEditor('/style.css', 'body { color: red; }'),
    createEditor('/script.js', 'console.log("before");')
  ];
  const listeners = new Map();
  const postedMessages = [];
  const editorByType = {
    html: editors[0],
    css: editors[1],
    js: editors[2]
  };
  const boxes = Object.fromEntries(Object.entries(editorByType).map(([editorType, editor]) => [
    editorType,
    {
      matches() {
        return false;
      },
      querySelector(selector) {
        return selector === '.cm-editor' ? editor.editorElement : null;
      }
    }
  ]));

  const window = {
    addEventListener(type, listener) {
      const entries = listeners.get(type) || [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    getSelection() {
      return null;
    },
    postMessage(message) {
      postedMessages.push(message);
    }
  };
  window.top = window;

  const document = {
    activeElement: editors[0].contentElement,
    head: { appendChild() {} },
    createElement() {
      return {};
    },
    getElementById() {
      return null;
    },
    querySelector(selector) {
      if (selector.startsWith('.box-')) {
        return classicBoxes ? boxes[selector.slice('.box-'.length)] || null : null;
      }
      return null;
    },
    querySelectorAll(selector) {
      return selector === '.cm-editor'
        ? editors.map((editor) => editor.editorElement)
        : [];
    }
  };

  const context = vm.createContext({
    clearTimeout,
    console,
    document,
    location: {
      href: 'https://codepen.io/user/pen/editor/id?file=/index.pen.html'
    },
    requestAnimationFrame(callback) {
      callback();
    },
    setTimeout,
    window
  });

  for (const relativePath of ['js/codepenEditorAdapter.js', 'inject.js']) {
    vm.runInContext(
      readFileSync(path.join(root, relativePath), 'utf8'),
      context,
      { filename: relativePath }
    );
  }

  const messageListener = listeners.get('message').at(-1);

  return {
    editors,
    postedMessages,
    async send(action, data = {}) {
      postedMessages.length = 0;
      await messageListener({
        source: window,
        data: {
          source: 'chrome-code-content',
          id: 7,
          action,
          ...data
        }
      });
      return postedMessages.at(-1);
    }
  };
}

test('reads the complete CodePen 2.0 documents through cmTile state', async () => {
  const bridge = loadBridge();
  const response = await bridge.send('getAllCode');

  assert.deepEqual(JSON.parse(JSON.stringify(response.result)), {
    html: '<main>Before</main>',
    css: 'body { color: red; }',
    js: 'console.log("before");'
  });
});

test('dispatches an acknowledged update to the matching CodePen 2.0 file', async () => {
  const bridge = loadBridge();
  const response = await bridge.send('setCode', {
    editorType: 'html',
    code: '<main>Injected</main>',
    changedLines: [0]
  });

  assert.equal(response.result, true);
  assert.equal(bridge.editors[0].getCode(), '<main>Injected</main>');
  assert.equal(bridge.editors[1].getCode(), 'body { color: red; }');
  assert.equal(bridge.editors[2].getCode(), 'console.log("before");');
});

test('supports a CodeMirror 6 editor nested in a legacy .box-* wrapper', async () => {
  const bridge = loadBridge({ classicBoxes: true });
  const response = await bridge.send('setCode', {
    editorType: 'css',
    code: 'body { color: blue; }'
  });

  assert.equal(response.result, true);
  assert.equal(bridge.editors[1].getCode(), 'body { color: blue; }');
});
