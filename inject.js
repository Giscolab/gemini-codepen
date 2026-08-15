if (window.top !== window) {
  console.log('[Chrome Code] inject.js ignored in iframe:', location.href);
} else {
  // Main-world bridge for both the Classic editor and the file-based CodePen
  // 2.0 editor. CodePen 2.0 uses CodeMirror 6 and no longer exposes .box-*.

  const recentConsoleErrors = [];
  const MAX_CONSOLE_ERRORS = 10;
  const EDITOR_TYPES = ['html', 'css', 'js'];
  const FILE_METADATA_ATTRIBUTES = [
    'data-file',
    'data-file-path',
    'data-path',
    'data-filename',
    'aria-label',
    'title'
  ];
  const editorAdapter = globalThis.CodePenEditorAdapter;

  window.addEventListener('error', (event) => {
    recentConsoleErrors.push(`${event.message} @ ${event.filename || 'unknown'}:${event.lineno || 0}`);
    if (recentConsoleErrors.length > MAX_CONSOLE_ERRORS) recentConsoleErrors.shift();
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = typeof event.reason === 'string'
      ? event.reason
      : (event.reason?.message || 'Unhandled promise rejection');
    recentConsoleErrors.push(`Unhandled rejection: ${reason}`);
    if (recentConsoleErrors.length > MAX_CONSOLE_ERRORS) recentConsoleErrors.shift();
  });

  const API = {
    _isEditorType(editorType) {
      return EDITOR_TYPES.includes(editorType);
    },

    _getClassicBox(editorType) {
      if (!this._isEditorType(editorType)) return null;
      return document.querySelector(`.box-${editorType}`);
    },

    _metadataValues(element) {
      if (!element || typeof element.getAttribute !== 'function') return [];

      const values = [];
      for (const attribute of FILE_METADATA_ATTRIBUTES) {
        const value = element.getAttribute(attribute);
        if (value) values.push(value);
      }

      if (element.matches?.('h1, h2, h3, h4, h5, h6')) {
        const text = element.textContent?.trim();
        if (text && text.length <= 200) values.push(text);
      }

      return values;
    },

    _collectModernCandidatePaths(editorElement) {
      if (!editorAdapter) return [];

      const visited = new Set();

      const collectElement = (element, values) => {
        if (!element || visited.has(element)) return;
        visited.add(element);
        values.push(...this._metadataValues(element));

        const metadataElements = element.querySelectorAll?.(
          '[data-file], [data-file-path], [data-path], [data-filename], ' +
          'h1, h2, h3, h4, h5, h6'
        );

        if (!metadataElements) return;
        for (const metadataElement of Array.from(metadataElements).slice(0, 50)) {
          const ownerEditor = metadataElement.closest?.('.cm-editor');
          if (ownerEditor && ownerEditor !== editorElement) continue;
          values.push(...this._metadataValues(metadataElement));
        }
      };

      let scope = editorElement;
      for (let depth = 0; scope && depth < 8; depth += 1) {
        const levelValues = [];
        collectElement(scope, levelValues);

        let sibling = scope.previousElementSibling;
        for (let siblingIndex = 0; sibling && siblingIndex < 3; siblingIndex += 1) {
          if (!sibling.querySelector?.('.cm-editor')) collectElement(sibling, levelValues);
          sibling = sibling.previousElementSibling;
        }

        const levelPaths = editorAdapter.extractFilePaths(levelValues);
        if (levelPaths.length === 1) return levelPaths;
        if (levelPaths.length > 1) {
          const currentFilePath = editorAdapter.getCurrentFilePath(location.href);
          const currentMatches = levelPaths.filter((filePath) => (
            editorAdapter.normalizeFilePath(filePath).replace(/^\//, '') ===
            currentFilePath.replace(/^\//, '')
          ));
          return currentMatches.length === 1 ? currentMatches : [];
        }

        const parent = scope.parentElement;
        if (!parent) break;

        const editorCount = parent.querySelectorAll?.('.cm-editor')?.length || 0;
        if (editorCount > 1) break;
        scope = parent;
      }

      return [];
    },

    _getModernCandidates() {
      return Array.from(document.querySelectorAll('.cm-editor')).map((element) => ({
        element,
        paths: this._collectModernCandidatePaths(element),
        active: !!document.activeElement && element.contains(document.activeElement)
      }));
    },

    _getBox(editorType) {
      const classicBox = this._getClassicBox(editorType);
      if (classicBox) return classicBox;
      if (!this._isEditorType(editorType) || !editorAdapter) return null;

      const candidates = this._getModernCandidates();
      const currentFilePath = editorAdapter.getCurrentFilePath(location.href);
      const candidate = editorAdapter.selectEditorCandidate(
        candidates,
        editorType,
        currentFilePath
      );

      return candidate?.element || null;
    },

    _getCM5(box) {
      const cmElement = box?.matches?.('.CodeMirror')
        ? box
        : box?.querySelector?.('.CodeMirror');
      return cmElement?.CodeMirror || null;
    },

    _getCM6Content(box) {
      if (!box) return null;
      const editorElement = box.matches?.('.cm-editor')
        ? box
        : box.querySelector?.('.cm-editor');
      return editorElement?.querySelector?.('.cm-content[contenteditable="true"], .cm-content') || null;
    },

    _getCM6View(box) {
      if (!box) return null;

      const editorElement = box.matches?.('.cm-editor')
        ? box
        : box.querySelector?.('.cm-editor');
      const contentElement = this._getCM6Content(box);
      if (!editorElement || !contentElement) return null;

      const isEditorView = (candidate) => (
        !!candidate &&
        typeof candidate.dispatch === 'function' &&
        typeof candidate.state?.doc?.toString === 'function'
      );

      const exposedEditorViewClasses = [
        globalThis.EditorView,
        globalThis.CodeMirror?.EditorView,
        globalThis.CodeMirror6?.EditorView
      ];

      for (const EditorViewClass of exposedEditorViewClasses) {
        if (typeof EditorViewClass?.findFromDOM !== 'function') continue;
        try {
          const publicView = EditorViewClass.findFromDOM(editorElement);
          if (isEditorView(publicView)) return publicView;
        } catch (error) {
          // The class may belong to another CodeMirror bundle instance.
        }
      }

      // CodeMirror 6's official EditorView.findFromDOM() follows this same
      // cmTile -> root -> view chain. It gives us the real document state,
      // including lines that are not currently rendered in the viewport.
      try {
        const tileView = (contentElement.cmTile || editorElement.cmTile)?.root?.view;
        if (isEditorView(tileView)) return tileView;
      } catch (error) {
        // Continue with compatibility probes for earlier CM6 integrations.
      }

      const resolveLegacyView = (candidate) => {
        if (isEditorView(candidate)) return candidate;
        if (isEditorView(candidate?.view)) return candidate.view;
        if (isEditorView(candidate?.rootView?.view)) return candidate.rootView.view;
        return null;
      };

      const elementsToCheck = [
        editorElement,
        contentElement,
        ...Array.from(editorElement.querySelectorAll?.('*') || []).slice(0, 100)
      ];

      for (const element of elementsToCheck) {
        const view = resolveLegacyView(element.cmView)
          || resolveLegacyView(element.view)
          || resolveLegacyView(element._cmView);
        if (view) return view;
      }

      return null;
    },

    getCode(editorType) {
      const box = this._getBox(editorType);
      const cm5 = this._getCM5(box);

      if (cm5) return cm5.getValue();

      const cm6View = this._getCM6View(box);
      if (cm6View) return cm6View.state.doc.toString();

      return null;
    },

    _highlightCM5Lines(cm5, changedLines) {
      if (!Array.isArray(changedLines) || changedLines.length === 0) return;

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

      const firstLine = Math.min(...changedLines);
      cm5.scrollIntoView({ line: firstLine, ch: 0 }, 200);

      changedLines.forEach((lineNumber) => {
        cm5.addLineClass(lineNumber, 'background', 'chrome-code-highlight');
      });

      setTimeout(() => {
        changedLines.forEach((lineNumber) => {
          cm5.removeLineClass(lineNumber, 'background', 'chrome-code-highlight');
        });
      }, 2000);
    },

    _waitForEditorSync() {
      return new Promise((resolve) => {
        const schedule = typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame
          : (callback) => setTimeout(callback, 0);
        schedule(() => schedule(resolve));
      });
    },

    async setCode(editorType, code, changedLines = []) {
      if (!this._isEditorType(editorType) || typeof code !== 'string') return false;

      const box = this._getBox(editorType);
      const cm5 = this._getCM5(box);

      if (cm5) {
        cm5.setValue(code);
        if (cm5.getValue() !== code) return false;
        this._highlightCM5Lines(cm5, changedLines);
        return true;
      }

      const cm6View = this._getCM6View(box);
      if (cm6View) {
        try {
          cm6View.dispatch({
            changes: {
              from: 0,
              to: cm6View.state.doc.length,
              insert: code
            }
          });

          if (cm6View.state.doc.toString() === code) return true;
        } catch (error) {
          console.warn('[Chrome Code] CodeMirror 6 dispatch failed', editorType, error);
        }
      }

      // Compatibility fallback for a CM6 build whose EditorView is not
      // discoverable. execCommand still creates a genuine contenteditable
      // edit event; success is accepted only after CodeMirror state confirms it.
      const cm6Content = this._getCM6Content(box);
      if (cm6Content && typeof document.execCommand === 'function') {
        cm6Content.focus();

        const selection = window.getSelection?.();
        if (selection && typeof document.createRange === 'function') {
          const range = document.createRange();
          range.selectNodeContents(cm6Content);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          document.execCommand('selectAll');
        }

        const didEdit = code
          ? document.execCommand('insertText', false, code)
          : document.execCommand('delete');

        await this._waitForEditorSync();
        if (didEdit && this.getCode(editorType) === code) return true;
      }

      console.error('[Chrome Code] editor update rejected', {
        editorType,
        currentFile: editorAdapter?.getCurrentFilePath(location.href) || '',
        candidates: this._getModernCandidates().map((candidate) => candidate.paths)
      });
      return false;
    },

    getAllCode() {
      const code = {
        html: this.getCode('html'),
        css: this.getCode('css'),
        js: this.getCode('js')
      };

      if (Object.values(code).some((value) => typeof value !== 'string')) return null;
      return code;
    },

    checkEditorsReady() {
      return EDITOR_TYPES.every((editorType) => {
        const box = this._getBox(editorType);
        return !!this._getCM5(box) || !!this._getCM6View(box);
      });
    },

    getConsoleErrors() {
      return [...recentConsoleErrors];
    }
  };

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;

    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.source !== 'chrome-code-content') return;
    if (!Number.isSafeInteger(message.id) || message.id < 0) return;
    if (!['checkReady', 'getCode', 'getAllCode', 'setCode', 'getConsoleErrors'].includes(message.action)) return;

    const response = { id: message.id, source: 'chrome-code-inject', result: null };

    try {
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
          response.result = await API.setCode(
            message.editorType,
            message.code,
            message.changedLines
          );
          break;
        case 'getConsoleErrors':
          response.result = API.getConsoleErrors();
          break;
      }
    } catch (error) {
      console.error('[Chrome Code] bridge action failed', message.action, error);
      response.result = message.action === 'getAllCode' ? null : false;
    }

    window.postMessage(response, '*');
  });
}
