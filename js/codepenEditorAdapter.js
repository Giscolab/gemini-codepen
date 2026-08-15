(function (root, factory) {
  const adapter = Object.freeze(factory());

  if (typeof module === 'object' && module.exports) {
    module.exports = adapter;
  } else {
    root.CodePenEditorAdapter = adapter;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const EXTENSIONS_BY_TYPE = {
    html: new Set(['html', 'htm', 'pug', 'haml', 'slim', 'md', 'markdown']),
    css: new Set(['css', 'scss', 'sass', 'less', 'styl', 'stylus', 'pcss', 'postcss']),
    js: new Set(['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'coffee', 'litcoffee', 'ls'])
  };

  const PRIMARY_FILE_PRIORITIES = {
    html: new Map([
      ['index.pen.html', 120],
      ['index.html', 110],
      ['index.htm', 100]
    ]),
    css: new Map([
      ['style.css', 120],
      ['styles.css', 115],
      ['style.scss', 110],
      ['styles.scss', 105]
    ]),
    js: new Map([
      ['script.js', 120],
      ['main.js', 115],
      ['index.js', 110],
      ['app.js', 105]
    ])
  };

  const FILE_TOKEN_PATTERN = /\/?(?:[\w@+.-]+\/)*[\w@+.-]+\.(?:pen\.html|html?|pug|haml|slim|md|markdown|css|scss|sass|less|styl|stylus|pcss|postcss|js|mjs|cjs|jsx|ts|tsx|coffee|litcoffee|ls)\b/gi;

  function normalizeFilePath(value) {
    if (typeof value !== 'string') return '';

    let decoded = value;
    try {
      decoded = decodeURIComponent(value);
    } catch (error) {
      // Keep the original value when a page exposes a partially encoded path.
    }

    return decoded
      .trim()
      .replace(/^["'`([{<]+|["'`\])}>:;,]+$/g, '')
      .replace(/\\/g, '/')
      .replace(/\/{2,}/g, '/')
      .replace(/^\.\//, '')
      .toLowerCase();
  }

  function getBaseName(filePath) {
    const normalized = normalizeFilePath(filePath).split(/[?#]/, 1)[0];
    return normalized.slice(normalized.lastIndexOf('/') + 1);
  }

  function classifyFilePath(filePath) {
    const baseName = getBaseName(filePath);
    if (!baseName) return null;
    if (baseName.endsWith('.pen.html')) return 'html';

    const extension = baseName.includes('.')
      ? baseName.slice(baseName.lastIndexOf('.') + 1)
      : '';

    for (const [editorType, extensions] of Object.entries(EXTENSIONS_BY_TYPE)) {
      if (extensions.has(extension)) return editorType;
    }

    return null;
  }

  function extractFilePaths(values) {
    const paths = new Set();

    for (const value of values || []) {
      if (typeof value !== 'string' || value.length > 500) continue;

      const matches = value.match(FILE_TOKEN_PATTERN) || [];
      for (const match of matches) {
        const normalized = normalizeFilePath(match);
        if (normalized && classifyFilePath(normalized)) paths.add(normalized);
      }
    }

    return Array.from(paths);
  }

  function filePriority(editorType, filePath) {
    if (classifyFilePath(filePath) !== editorType) return -1;
    return PRIMARY_FILE_PRIORITIES[editorType]?.get(getBaseName(filePath)) || 20;
  }

  function selectPrimaryFilePath(filePaths, editorType) {
    const matchingPaths = (filePaths || [])
      .filter((filePath) => classifyFilePath(filePath) === editorType)
      .sort((left, right) => filePriority(editorType, right) - filePriority(editorType, left));

    if (matchingPaths.length === 0) return '';
    if (
      matchingPaths.length > 1 &&
      filePriority(editorType, matchingPaths[0]) === filePriority(editorType, matchingPaths[1])
    ) {
      return '';
    }

    return matchingPaths[0];
  }

  function sameFilePath(left, right) {
    const normalizedLeft = normalizeFilePath(left).replace(/^\//, '');
    const normalizedRight = normalizeFilePath(right).replace(/^\//, '');
    return normalizedLeft !== '' && normalizedLeft === normalizedRight;
  }

  function selectEditorCandidate(candidates, editorType, currentFilePath = '') {
    if (!EXTENSIONS_BY_TYPE[editorType]) return null;

    const scored = [];

    for (const candidate of candidates || []) {
      const matchingPaths = (candidate.paths || [])
        .filter((filePath) => classifyFilePath(filePath) === editorType);

      if (matchingPaths.length === 0) continue;

      let score = Math.max(...matchingPaths.map((filePath) => filePriority(editorType, filePath)));

      if (candidate.active) score += 200;
      if (matchingPaths.some((filePath) => sameFilePath(filePath, currentFilePath))) {
        score += 1000;
      }

      scored.push({ candidate, score });
    }

    if (scored.length === 0) {
      const currentType = classifyFilePath(currentFilePath);
      if (currentType === editorType && candidates?.length === 1) {
        return candidates[0];
      }
      return null;
    }

    scored.sort((left, right) => right.score - left.score);
    if (scored.length > 1 && scored[0].score === scored[1].score) return null;
    return scored[0].candidate;
  }

  function getCurrentFilePath(url) {
    try {
      return normalizeFilePath(new URL(url).searchParams.get('file') || '');
    } catch (error) {
      return '';
    }
  }

  return {
    classifyFilePath,
    extractFilePaths,
    getCurrentFilePath,
    normalizeFilePath,
    sameFilePath,
    selectEditorCandidate,
    selectPrimaryFilePath
  };
}));
