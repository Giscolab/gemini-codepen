if (window.top !== window) {
  console.log('[Chrome Code] inject.js ignored in iframe:', location.href);
} else {
  // Main-world bridge for both the Classic editor and the file-based CodePen
  // 2.0 editor. CodePen 2.0 uses CodeMirror 6 and no longer exposes .box-*.

  const recentConsoleErrors = [];
  const MAX_CONSOLE_ERRORS = 10;
  const EDITOR_TYPES = ['html', 'css', 'js'];
  const CODEPEN_EDITOR_HOST_SELECTOR = 'cp-codemirror-editor';
  const OPEN_FILE_TAB_SELECTOR = '[role="button"][data-file]';
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
      const codePenHosts = Array.from(
        document.querySelectorAll(CODEPEN_EDITOR_HOST_SELECTOR)
      );

      const hostCandidates = codePenHosts.map((element) => {
        const shadowRoot = element.shadow || element.shadowRoot;
        const activeElement = shadowRoot?.activeElement || document.activeElement;

        return {
          element,
          paths: this._collectModernCandidatePaths(element),
          active: element === document.activeElement ||
            !!activeElement && (
              element.contains?.(activeElement) ||
              shadowRoot?.contains?.(activeElement)
            )
        };
      });

      const directCandidates = Array.from(document.querySelectorAll('.cm-editor'))
        .filter((element) => !element.closest?.(CODEPEN_EDITOR_HOST_SELECTOR))
        .map((element) => ({
          element,
          paths: this._collectModernCandidatePaths(element),
          active: !!document.activeElement && element.contains(document.activeElement)
        }));

      return [...hostCandidates, ...directCandidates];
    },

    _getOpenFileTabs() {
      if (!editorAdapter) return [];

      return Array.from(document.querySelectorAll(OPEN_FILE_TAB_SELECTOR))
        .map((element) => {
          const values = this._metadataValues(element);

          for (const heading of element.querySelectorAll?.('h1, h2, h3, h4, h5, h6') || []) {
            const text = heading.textContent?.trim();
            if (text) values.push(text);
          }

          return {
            element,
            paths: editorAdapter.extractFilePaths(values),
            active: element.getAttribute?.('data-active') === 'true'
          };
        })
        .filter((candidate) => candidate.paths.length > 0);
    },

    _getActiveModernFilePath() {
      const activeTab = this._getOpenFileTabs().find((candidate) => candidate.active);
      if (activeTab?.paths.length === 1) return activeTab.paths[0];

      const activeHost = this._getModernCandidates().find((candidate) => candidate.active)
        || this._getModernCandidates()[0];
      return activeHost?.paths.length === 1 ? activeHost.paths[0] : '';
    },

    _getMountedModernHost(filePath) {
      if (!editorAdapter || !filePath) return null;

      const matchingCandidates = this._getModernCandidates().filter((candidate) => (
        candidate.paths.some((candidatePath) => editorAdapter.sameFilePath(candidatePath, filePath))
      ));

      return matchingCandidates.length === 1 ? matchingCandidates[0].element : null;
    },

    async _waitForMountedModernHost(filePath, timeout = 2000) {
      const startedAt = Date.now();

      while (Date.now() - startedAt < timeout) {
        const host = this._getMountedModernHost(filePath);
        if (host && this._getCM6View(host)) return host;

        await new Promise((resolve) => {
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(resolve);
          } else {
            setTimeout(resolve, 16);
          }
        });
      }

      return null;
    },

    async _activateModernFilePath(filePath) {
      if (!editorAdapter || !filePath) return null;

      const tab = this._getOpenFileTabs().find((candidate) => (
        candidate.paths.some((candidatePath) => editorAdapter.sameFilePath(candidatePath, filePath))
      ));
      if (!tab) return null;

      const mountedHost = this._getMountedModernHost(filePath);
      if (mountedHost && this._getCM6View(mountedHost)) return mountedHost;

      tab.element.click?.();
      return this._waitForMountedModernHost(filePath);
    },

    async _activateModernEditorType(editorType) {
      if (!editorAdapter) return null;

      const tab = editorAdapter.selectEditorCandidate(
        this._getOpenFileTabs(),
        editorType,
        ''
      );
      if (!tab) return null;

      const filePath = editorAdapter.selectPrimaryFilePath(tab.paths, editorType);
      if (!filePath) return null;

      const box = await this._activateModernFilePath(filePath);
      return box ? { box, filePath } : null;
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
        : box.querySelector?.('.cm-editor')
          || box.shadow?.querySelector?.('.cm-editor')
          || box.shadowRoot?.querySelector?.('.cm-editor');
      return editorElement?.querySelector?.('.cm-content[contenteditable="true"], .cm-content') || null;
    },

    _getCM6View(box) {
      if (!box) return null;

      const isEditorView = (candidate) => (
        !!candidate &&
        typeof candidate.dispatch === 'function' &&
        typeof candidate.state?.doc?.toString === 'function'
      );

      // CodePen 2.0 deliberately keeps CodeMirror inside a closed Shadow DOM,
      // but its cp-codemirror-editor host exposes the real EditorView directly.
      if (isEditorView(box.editorView)) return box.editorView;

      const editorElement = box.matches?.('.cm-editor')
        ? box
        : box.querySelector?.('.cm-editor')
          || box.shadow?.querySelector?.('.cm-editor')
          || box.shadowRoot?.querySelector?.('.cm-editor');
      const contentElement = this._getCM6Content(box);
      if (!editorElement || !contentElement) return null;

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

    _readCodeFromBox(box) {
      const cm5 = this._getCM5(box);

      if (cm5) return cm5.getValue();

      const cm6View = this._getCM6View(box);
      if (cm6View) return cm6View.state.doc.toString();

      return null;
    },

    getCode(editorType) {
      return this._readCodeFromBox(this._getBox(editorType));
    },

    async _readEditorCode(editorType) {
      const mountedCode = this.getCode(editorType);
      if (typeof mountedCode === 'string') return mountedCode;

      const activated = await this._activateModernEditorType(editorType);
      return activated ? this._readCodeFromBox(activated.box) : null;
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

      const originalFilePath = this._getActiveModernFilePath();
      let box = this._getBox(editorType);
      const cm5 = this._getCM5(box);

      if (cm5) {
        cm5.setValue(code);
        if (cm5.getValue() !== code) return false;
        this._highlightCM5Lines(cm5, changedLines);
        return true;
      }

      let activatedFilePath = '';
      if (!this._getCM6View(box)) {
        const activated = await this._activateModernEditorType(editorType);
        box = activated?.box || box;
        activatedFilePath = activated?.filePath || '';
      }

      let updated = false;

      try {
        const cm6View = this._getCM6View(box);
        if (cm6View) {
          cm6View.dispatch({
            changes: {
              from: 0,
              to: cm6View.state.doc.length,
              insert: code
            }
          });

          updated = cm6View.state.doc.toString() === code;
        }

        // Compatibility fallback for a CM6 build whose EditorView is not
        // discoverable. execCommand still creates a genuine contenteditable
        // edit event; success is accepted only after CodeMirror state confirms it.
        if (!updated) {
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
            updated = didEdit && this._readCodeFromBox(box) === code;
          }
        }
      } catch (error) {
        console.warn('[Chrome Code] CodeMirror 6 dispatch failed', editorType, error);
      } finally {
        if (
          originalFilePath &&
          activatedFilePath &&
          !editorAdapter?.sameFilePath(originalFilePath, activatedFilePath)
        ) {
          await this._activateModernFilePath(originalFilePath);
        }
      }

      if (updated) return true;

      console.error('[Chrome Code] editor update rejected', {
        editorType,
        currentFile: this._getActiveModernFilePath() ||
          editorAdapter?.getCurrentFilePath(location.href) || '',
        candidates: this._getModernCandidates().map((candidate) => candidate.paths)
      });
      return false;
    },

    async getAllCode() {
      const originalFilePath = this._getActiveModernFilePath();
      const code = {};

      try {
        for (const editorType of EDITOR_TYPES) {
          code[editorType] = await this._readEditorCode(editorType);
        }
      } finally {
        if (originalFilePath) {
          await this._activateModernFilePath(originalFilePath);
        }
      }

      if (Object.values(code).some((value) => typeof value !== 'string')) return null;
      return code;
    },

    checkEditorsReady() {
      const openFileTabs = this._getOpenFileTabs();
      if (openFileTabs.length > 0) {
        const hasPrimaryFiles = EDITOR_TYPES.every((editorType) => (
          !!editorAdapter?.selectEditorCandidate(openFileTabs, editorType, '')
        ));
        const hasMountedEditor = this._getModernCandidates().some((candidate) => (
          !!this._getCM6View(candidate.element)
        ));

        return hasPrimaryFiles && hasMountedEditor;
      }

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
          response.result = await API._readEditorCode(message.editorType);
          break;
        case 'getAllCode':
          response.result = await API.getAllCode();
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
