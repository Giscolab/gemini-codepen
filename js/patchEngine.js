(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./updateParser.js'));
  } else {
    root.PatchEngine = factory(root.UpdateParser);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (UpdateParser) {
  if (!UpdateParser) {
    throw new Error('PatchEngine requires UpdateParser');
  }

  function findOccurrences(text, searchText) {
    const indexes = [];
    let fromIndex = 0;

    while (fromIndex <= text.length - searchText.length) {
      const index = text.indexOf(searchText, fromIndex);
      if (index === -1) break;
      indexes.push(index);
      // Advance by one so overlapping matches are also treated as ambiguous.
      fromIndex = index + 1;
    }

    return indexes;
  }

  function addChangedLines(changedLines, code, startIndex, searchText, replaceText) {
    const startLine = code.slice(0, startIndex).split('\n').length - 1;
    const searchLineCount = searchText ? searchText.split('\n').length : 0;
    const replaceLineCount = replaceText ? replaceText.split('\n').length : 0;
    const affectedLineCount = Math.max(searchLineCount, replaceLineCount);

    for (let index = 0; index < affectedLineCount; index += 1) {
      changedLines.add(startLine + index);
    }
  }

  function applySearchReplace(currentCode, responseText, marker) {
    const updateBlocks = UpdateParser.extractUpdateBlocks(responseText)
      .filter((block) => block.marker === marker);

    if (updateBlocks.length === 0) return null;

    const sections = updateBlocks.flatMap((block) => (
      UpdateParser.parseSearchReplaceSections(block.content)
    ));

    if (sections.length === 0) {
      return {
        code: null,
        lines: [],
        errors: [`${marker} block found but no valid SEARCH/REPLACE pairs were provided.`]
      };
    }

    const originalCode = typeof currentCode === 'string' ? currentCode : '';
    let workingCode = originalCode;
    const changedLines = new Set();
    const errors = [];
    const editorName = marker.replace('UPDATE_', '');

    for (const section of sections) {
      const searchText = section.searchText;
      const replaceText = section.replaceText;

      if (!searchText) {
        if (!replaceText) continue;

        const separator = workingCode && !workingCode.endsWith('\n') ? '\n' : '';
        const startIndex = workingCode.length + separator.length;
        workingCode += separator + replaceText;
        addChangedLines(changedLines, workingCode, startIndex, '', replaceText);
        continue;
      }

      const occurrences = findOccurrences(workingCode, searchText);

      if (occurrences.length === 0) {
        errors.push(`In ${editorName} editor, could not find the exact SEARCH text:\n${searchText}`);
        continue;
      }

      if (occurrences.length > 1) {
        errors.push(`In ${editorName} editor, SEARCH text is ambiguous (${occurrences.length} matches):\n${searchText}`);
        continue;
      }

      const searchIndex = occurrences[0];
      if (searchText !== replaceText) {
        addChangedLines(changedLines, workingCode, searchIndex, searchText, replaceText);
        workingCode = workingCode.slice(0, searchIndex) + replaceText + workingCode.slice(searchIndex + searchText.length);
      }
    }

    if (errors.length > 0) {
      return { code: null, lines: [], errors };
    }

    if (workingCode === originalCode) return null;

    return {
      code: workingCode,
      lines: Array.from(changedLines).sort((a, b) => a - b),
      errors: []
    };
  }

  return {
    applySearchReplace,
    findOccurrences
  };
}));
