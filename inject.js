if (window.top !== window) {
  console.log('[Chrome Code] inject.js ignored in iframe:', location.href);
  throw new Error('Ignore iframe');
}


// This script runs in the main world (same context as CodePen)
// It has access to the page's JavaScript including CodeMirror instances
// Communicates with content.js (isolated world) via window.postMessage

const recentConsoleErrors = [];
const MAX_CONSOLE_ERRORS = 10;

window.addEventListener('error', (event) => {
  recentConsoleErrors.push(`${event.message} @ ${event.filename || 'unknown'}:${event.lineno || 0}`);
  if (recentConsoleErrors.length > MAX_CONSOLE_ERRORS) recentConsoleErrors.shift();
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = typeof event.reason === 'string' ? event.reason : (event.reason?.message || 'Unhandled promise rejection');
  recentConsoleErrors.push(`Unhandled rejection: ${reason}`);
  if (recentConsoleErrors.length > MAX_CONSOLE_ERRORS) recentConsoleErrors.shift();
});

const API = {
  getCode(editorType) {
    const box = document.querySelector(`.box-${editorType}`);
    if (box) {
      const cmElement = box.querySelector('.CodeMirror');
      if (cmElement && cmElement.CodeMirror) {
        return cmElement.CodeMirror.getValue();
      }
    }
    return null;
  },

  setCode(editorType, code, changedLines = []) {
    const box = document.querySelector(`.box-${editorType}`);
    if (box) {
      const cmElement = box.querySelector('.CodeMirror');
      if (cmElement && cmElement.CodeMirror) {
        const cm = cmElement.CodeMirror;
        cm.setValue(code);

        // Highlight changed lines
        if (changedLines && changedLines.length > 0) {
          // Add CSS for highlight animation if not already added
          if (!document.getElementById('chrome-code-highlight-style')) {
            const style = document.createElement('style');
            style.id = 'chrome-code-highlight-style';
            style.textContent = `
              .chrome-code-highlight {
                background-color: rgba(255, 200, 0, 0.3) !important;
                animation: chrome-code-flash 2s ease-out;
              }
              @keyframes chrome-code-flash {
                0%, 100% { background-color: rgba(255, 200, 0, 0); }
                10%, 90% { background-color: rgba(255, 200, 0, 0.3); }
              }
            `;
            document.head.appendChild(style);
          }

          // Scroll to the first changed line
          const firstLine = Math.min(...changedLines);
          cm.scrollIntoView({line: firstLine, ch: 0}, 200);

          // Highlight each changed line
          changedLines.forEach(lineNum => {
            cm.addLineClass(lineNum, 'background', 'chrome-code-highlight');
          });

          // Remove highlights after animation completes
          setTimeout(() => {
            changedLines.forEach(lineNum => {
              cm.removeLineClass(lineNum, 'background', 'chrome-code-highlight');
            });
          }, 2000);
        }

        return true;
      }
    }
    return false;
  },

  getAllCode() {
    return {
      html: this.getCode('html') || '',
      css: this.getCode('css') || '',
      js: this.getCode('js') || ''
    };
  },

  checkEditorsReady() {
    const html = this.getCode('html');
    const css = this.getCode('css');
    const js = this.getCode('js');
    return html !== null || css !== null || js !== null;
  },

  getConsoleErrors() {
    return [...recentConsoleErrors];
  }
};

// Listen for messages from content script
window.addEventListener('message', (event) => {
  // Only accept messages from same origin
  if (event.source !== window) return;

  const message = event.data;
  if (message.source !== 'chrome-code-content') return;

  let response = { id: message.id, source: 'chrome-code-inject' };

  switch (message.action) {
    case 'checkReady':
      response.result = API.checkEditorsReady();
      break;
    case 'getCode':
      response.result = API.getCode(message.editorType);
      break;
    case 'getAllCode':
      response.result = API.getAllCode();
      break;
    case 'setCode':
      response.result = API.setCode(message.editorType, message.code, message.changedLines);
      break;
    case 'getConsoleErrors':
      response.result = API.getConsoleErrors();
      break;
  }

  window.postMessage(response, '*');
});
