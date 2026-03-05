if (window.top !== window) {
  console.log('[Chrome Code] inject.js ignored in iframe:', location.href);
} else {


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
  _getBox(editorType) {
    return document.querySelector(`.box-${editorType}`);
  },

  _getCM5(box) {
    const cmElement = box?.querySelector?.('.CodeMirror');
    return cmElement?.CodeMirror || null;
  },

  _getCM6Content(box) {
    return box?.querySelector?.('.cm-editor .cm-content[contenteditable="true"]') || null;
  },

  _getCM6View(box) {
    const editorEl = box?.querySelector?.('.cm-editor');
    if (!editorEl) return null;

    const resolveView = (candidate) => {
      if (!candidate) return null;
      if (typeof candidate.dispatch === 'function' && candidate.state?.doc) return candidate;
      if (typeof candidate.view?.dispatch === 'function' && candidate.view?.state?.doc) return candidate.view;
      if (typeof candidate.rootView?.view?.dispatch === 'function' && candidate.rootView?.view?.state?.doc) {
        return candidate.rootView.view;
      }
      return null;
    };

    const elementsToCheck = [editorEl, ...editorEl.querySelectorAll('*')];
    for (const element of elementsToCheck) {
      const view = resolveView(element.cmView) || resolveView(element.view) || resolveView(element._cmView);
      if (view) return view;
    }

    return null;
  },

  getCode(editorType) {
    const box = this._getBox(editorType);
    const cm5 = this._getCM5(box);

    if (cm5) {
      return cm5.getValue();
    }

    const cm6Content = this._getCM6Content(box);
    if (cm6Content) {
      return cm6Content.innerText.replace(/\u00a0/g, ' ');
    }

    return null;
  },

  setCode(editorType, code, changedLines = []) {
    const box = this._getBox(editorType);
    const cm5 = this._getCM5(box);

    if (cm5) {
      cm5.setValue(code);

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
          cm5.scrollIntoView({line: firstLine, ch: 0}, 200);

          // Highlight each changed line
          changedLines.forEach(lineNum => {
            cm5.addLineClass(lineNum, 'background', 'chrome-code-highlight');
          });

          // Remove highlights after animation completes
          setTimeout(() => {
            changedLines.forEach(lineNum => {
              cm5.removeLineClass(lineNum, 'background', 'chrome-code-highlight');
            });
          }, 2000);
        }

        return true;
    }

    const cm6View = this._getCM6View(box);
    if (cm6View) {
      try {
        const docLength = cm6View.state.doc.length;
        cm6View.dispatch({
          changes: { from: 0, to: docLength, insert: code }
        });

        if (cm6View.state.doc.toString() === code) {
          console.log('[Chrome Code] CM6 dispatch ok', editorType);
          return true;
        }
      } catch (error) {
        console.warn('[Chrome Code] CM6 dispatch erreur, fallback requis', error);
      }
    }

    const cm6Content = this._getCM6Content(box);
    if (cm6Content) {
      cm6Content.focus();
      document.execCommand('selectAll');

      const didInsert = document.execCommand('insertText', false, code);
      if (didInsert) {
        console.log('[Chrome Code] fallback utilisé', editorType);
        return true;
      }

      cm6Content.textContent = code;
      cm6Content.dispatchEvent(new InputEvent('input', { bubbles: true, data: code }));

      if (cm6Content.textContent === code) {
        console.log('[Chrome Code] fallback utilisé', editorType);
        return true;
      }
    }

    console.error('[Chrome Code] échec setCode', editorType);
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
    const hasCM5 = !!document.querySelector('.CodeMirror');
    const hasCM6 = !!document.querySelector('.cm-editor .cm-content[contenteditable="true"]');
    return hasCM5 || hasCM6;
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

  console.log('[Chrome Code] inject received', message.action, 'ready=', API.checkEditorsReady());

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
}
