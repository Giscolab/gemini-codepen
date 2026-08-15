if (window.top !== window) {
  // Important: évite que des iframes répondent aux messages à la place de l’éditeur
  console.log('[Chrome Code] content.js ignored in iframe:', location.href);
} else {
  // Content script that runs on CodePen pages (in isolated world)
  // Communicates with inject.js (which runs in main world) via window.postMessage

  // Message passing between isolated world (content.js) and main world (inject.js)
  let messageId = 0;
  const pendingMessages = new Map();

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.source !== 'chrome-code-inject') return;

    const pending = pendingMessages.get(message.id);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pendingMessages.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(message.result);
      }
    }
  });

  const MAIN_WORLD_TIMEOUTS = {
    checkReady: 2000,
    getAllCode: 18000,
    setCode: 12000,
    getConsoleErrors: 1500
  };

  function sendToMainWorld(action, data = {}) {
    return new Promise((resolve, reject) => {
      const id = messageId++;
      const timeoutId = setTimeout(() => {
        const pending = pendingMessages.get(id);
        if (pending) {
          pendingMessages.delete(id);
          pending.reject(new Error(`Le pont CodePen n’a pas répondu à l’action ${action}`));
        }
      }, MAIN_WORLD_TIMEOUTS[action] || 3000);

      pendingMessages.set(id, { resolve, reject, timeoutId });

      window.postMessage({
        source: 'chrome-code-content',
        id,
        action,
        ...data
      }, '*');

    });
  }

  async function checkEditorsReady() {
    return await sendToMainWorld('checkReady');
  }

  async function getAllCode() {
    return await sendToMainWorld('getAllCode');
  }

  async function setCode(editorType, code, changedLines) {
    return await sendToMainWorld('setCode', { editorType, code, changedLines });
  }

  async function getConsoleErrors() {
    return await sendToMainWorld('getConsoleErrors');
  }

  // Listen for messages from the background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_CODE') {
      getAllCode().then(code => {
        if (!code || typeof code !== 'object') {
          sendResponse({
            success: false,
            error: 'Timed out while reading the CodePen editors'
          });
          return;
        }

        sendResponse({
          success: true,
          code: code
        });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // Will respond asynchronously
    }

    if (message.type === 'UPDATE_CODE') {
      setCode(message.editor, message.code, message.changedLines).then(success => {
        sendResponse({
          success: success === true,
          error: success === true ? undefined : `The ${message.editor} editor rejected the update`
        });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // Will respond asynchronously
    }

    if (message.type === 'GET_CONSOLE_ERRORS') {
      getConsoleErrors().then(errors => {
        sendResponse({
          success: true,
          errors: errors || []
        });
      }).catch(error => {
        sendResponse({ success: false, error: error.message, errors: [] });
      });
      return true;
    }

    return false;
  });

  // Monitor for CodePen editor initialization
  // Sometimes editors aren't ready immediately
  let retryCount = 0;
  const maxRetries = 60;

  async function checkEditorsReadyLoop() {
    let ready = false;

    try {
      ready = await checkEditorsReady();
    } catch (error) {
      // The MAIN-world bridge and CodePen's editor do not always initialize in
      // the same order. A transient timeout must not permanently stop probing.
      console.debug('[Chrome Code] editor readiness probe failed; retrying', error);
    }

    if (ready) {
      try {
        const notification = chrome.runtime.sendMessage({ type: 'CONTENT_READY' });
        notification?.catch?.((error) => {
          console.debug('[Chrome Code] CONTENT_READY notification failed', error);
        });
      } catch (error) {
        console.debug('[Chrome Code] extension context unavailable', error);
      }
    } else if (retryCount < maxRetries) {
      retryCount++;
      setTimeout(checkEditorsReadyLoop, 1000);
    }
  }

  // Wait for page to be fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(checkEditorsReadyLoop, 1000);
    });
  } else {
    setTimeout(checkEditorsReadyLoop, 1000);
  }
}
