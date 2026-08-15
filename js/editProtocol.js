(function (root, factory) {
  const protocol = Object.freeze(factory());

  if (typeof module === 'object' && module.exports) {
    module.exports = protocol;
  } else {
    root.EditProtocol = protocol;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MARKER_BY_SCOPE = Object.freeze({
    html: 'UPDATE_HTML',
    css: 'UPDATE_CSS',
    js: 'UPDATE_JS'
  });

  function getEnabledMarkers(scopes = {}) {
    return Object.entries(MARKER_BY_SCOPE)
      .filter(([scope]) => scopes[scope] === true)
      .map(([, marker]) => marker);
  }

  function getApplicableBlocks(updateBlocks = [], scopes = {}) {
    const enabledMarkers = new Set(getEnabledMarkers(scopes));
    return updateBlocks.filter((block) => enabledMarkers.has(block?.marker));
  }

  function needsRepair(mode, scopes, updateBlocks) {
    return mode === 'edit' &&
      getEnabledMarkers(scopes).length > 0 &&
      getApplicableBlocks(updateBlocks, scopes).length === 0;
  }

  function buildRepairMessage(scopes = {}) {
    const enabledMarkers = getEnabledMarkers(scopes);
    const markerExamples = enabledMarkers
      .map((marker) => `[${marker}]...[/` + `${marker}]`)
      .join(', ');

    return `PROTOCOL CORRECTION: Your previous response cannot be applied to the editor. ` +
      `Do not explain or summarize the project. Fulfill the user's most recent modification request now. ` +
      `Return at least one valid enabled update block (${markerExamples}). ` +
      `Each block must contain <<<SEARCH>>> text copied exactly from CURRENT CODE and its <<<REPLACE>>> text. ` +
      `Do not use Markdown code fences and do not target a disabled scope.`;
  }

  return {
    buildRepairMessage,
    getApplicableBlocks,
    getEnabledMarkers,
    needsRepair
  };
}));
