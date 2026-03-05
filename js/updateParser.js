(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.UpdateParser = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeBlockText(text) {
    let normalized = (text || '')
      .replace(/\r/g, '')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '');

    const fencedMatch = normalized.trim().match(/^```[^\n]*\n([\s\S]*?)\n```$/);
    if (fencedMatch) {
      normalized = fencedMatch[1]
        .replace(/^\n+/, '')
        .replace(/\n+$/, '');
    }

    return normalized;
  }

  function extractUpdateBlocks(responseText) {
    const text = responseText || '';
    const blocks = [];
    const pattern = /\[\s*UPDATE_(HTML|CSS|JS)\s*\]([\s\S]*?)\[\s*\/\s*UPDATE_\1\s*\]/gi;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const marker = `UPDATE_${String(match[1]).toUpperCase()}`;
      blocks.push({
        marker,
        content: normalizeBlockText(match[2]),
        raw: match[0],
        start: match.index,
        end: match.index + match[0].length
      });
    }

    return blocks;
  }

  function stripUpdateBlocks(responseText) {
    const blocks = extractUpdateBlocks(responseText);
    if (blocks.length === 0) {
      return (responseText || '').trim();
    }

    let cursor = 0;
    let output = '';
    for (const block of blocks) {
      output += (responseText || '').slice(cursor, block.start);
      cursor = block.end;
    }
    output += (responseText || '').slice(cursor);

    return output.trim();
  }

  function parseSearchReplaceSections(blockContent) {
    const normalized = normalizeBlockText(blockContent);
    const sections = normalized.split(/<<<\s*SEARCH\s*>>>/i).slice(1);
    const parsedSections = [];

    for (const section of sections) {
      const replaceMatch = section.match(/<<<\s*REPLACE\s*>>>/i);
      if (!replaceMatch) continue;

      const replaceIndex = replaceMatch.index;
      const searchPart = section.slice(0, replaceIndex);
      const replacePart = section.slice(replaceIndex + replaceMatch[0].length);

      parsedSections.push({
        searchText: normalizeBlockText(searchPart),
        replaceText: normalizeBlockText(replacePart.split('<<<')[0])
      });
    }

    return parsedSections;
  }

  return {
    normalizeBlockText,
    extractUpdateBlocks,
    stripUpdateBlocks,
    parseSearchReplaceSections
  };
}));
