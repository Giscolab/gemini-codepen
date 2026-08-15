// DevTools panel script
// Handles UI interactions and communication with AI providers (Cloud, Local)

const messagesContainer = document.getElementById('messages');
const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const closeSettingsBtn = document.getElementById('close-settings');
const apiKeyInput = document.getElementById('api-key');
const saveSettingsBtn = document.getElementById('save-settings');
const statusElement = document.getElementById('status');
const providerTabs = document.querySelectorAll('.provider-tab');
const providerGroups = document.querySelectorAll('.provider-group');
const freeProviderSelect = document.getElementById('free-provider');
const paidProviderSelect = document.getElementById('paid-provider');
const apiKeyHelp = document.getElementById('api-key-help');
const settingsTitle = document.getElementById('settings-title');
const apiKeyLabel = document.querySelector('#settings-panel label');
const modeBtn = document.getElementById('mode-btn');
const refactorOnlyInput = document.getElementById('refactor-only');
const scopeInputs = document.querySelectorAll('#scope-selector input[type=\"checkbox\"]');

let apiKeys = {};
let aiProvider = 'claude';
let conversationHistory = [];
let backgroundPort = null;
let tabId = chrome.devtools.inspectedWindow.tabId;
let currentCode = { html: '', css: '', js: '' };
let isPortConnected = false;
let agent = null;
let assistantMode = 'edit';
let refactorOnly = false;
let selectedModel = '';
let isRequestInFlight = false;
let requestSequence = 0;
let refreshCodePromise = null;

// Provider configuration
const MODEL_CONFIG = {
  'local-chrome': { provider: 'local', keyId: null, label: 'Chrome AI (Gemini Nano)' },
  'gemini-free': { provider: 'gemini', keyId: 'gemini', label: 'Gemini Free' },
  'qwen-2.5-coder': { provider: 'openrouter', keyId: 'openrouter', label: 'Qwen 2.5 Coder' },
  'deepseek-coder': { provider: 'deepseek', keyId: 'deepseek', label: 'DeepSeek Coder' },
  'deepseek-v3.2': { provider: 'deepseek', keyId: 'deepseek', label: 'DeepSeek V3.2' },
  'mistral-small': { provider: 'openrouter', keyId: 'openrouter', label: 'Mistral Small' },
  'groq-llama': { provider: 'groq', keyId: 'groq', label: 'Groq LLaMA' },
  'gpt-4o': { provider: 'openai', keyId: 'openai', label: 'GPT-4o' },
  'gpt-4.1': { provider: 'openai', keyId: 'openai', label: 'GPT-4.1' },
  'gpt-deep-research': { provider: 'openai', keyId: 'openai', label: 'GPT Deep Research' },
  'claude-sonnet': { provider: 'claude', keyId: 'claude', label: 'Claude Sonnet' },
  'claude-opus': { provider: 'claude', keyId: 'claude', label: 'Claude Opus' },
  'gemini-pro': { provider: 'gemini', keyId: 'gemini', label: 'Gemini Pro' },
  'mistral-large': { provider: 'mistral', keyId: 'mistral', label: 'Mistral Large' },
  'magistral': { provider: 'mistral', keyId: 'mistral', label: 'Magistral' },
  'perplexity-pro': { provider: 'perplexity', keyId: 'perplexity', label: 'Perplexity Pro' },
  'perplexity-deep-research': { provider: 'perplexity', keyId: 'perplexity', label: 'Perplexity Deep Research' },
  'grok-reasoning': { provider: 'xai', keyId: 'xai', label: 'Grok Reasoning' },
  'k2.5': { provider: 'openrouter', keyId: 'openrouter', label: 'K2.5' },
  'together-mixtral': { provider: 'together', keyId: 'together', label: 'Mixtral (Together)' }
};

const LEGACY_LOCAL_MODELS = new Set([
  'local-ollama',
  'local-lmstudio',
  'local-vllm'
]);

const KEY_HELP = {
  claude: 'Clé Anthropic',
  gemini: 'Clé Google AI Studio',
  openai: 'Clé OpenAI',
  mistral: 'Clé Mistral',
  perplexity: 'Clé Perplexity',
  xai: 'Clé xAI',
  groq: 'Clé Groq',
  together: 'Clé Together.ai',
  deepseek: 'Clé DeepSeek',
  openrouter: 'Clé OpenRouter'
};

const HELP_LINKS = {
  claude: 'https://console.anthropic.com/',
  gemini: 'https://aistudio.google.com/apikey',
  openai: 'https://platform.openai.com/api-keys',
  mistral: 'https://console.mistral.ai/api-keys/',
  perplexity: 'https://www.perplexity.ai/settings/api',
  xai: 'https://console.x.ai/',
  groq: 'https://console.groq.com/keys',
  together: 'https://api.together.xyz/settings/api-keys',
  deepseek: 'https://platform.deepseek.com/api_keys',
  openrouter: 'https://openrouter.ai/keys'
};

const getCurrentModelConfig = () => MODEL_CONFIG[selectedModel] || null;

const getApiKey = () => {
  const modelConfig = getCurrentModelConfig();
  if (!modelConfig || !modelConfig.keyId) return '';
  return apiKeys[modelConfig.keyId] || '';
};

// Map UI model selections to currently supported providers
const mapModelToProvider = (model) => {
  const modelConfig = MODEL_CONFIG[model];
  if (!modelConfig) return 'claude';
  return modelConfig.provider;
};

function showProviderTab(tab) {
  providerTabs.forEach((button) => {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  providerGroups.forEach((group) => {
    const isActive = group.dataset.group === tab;
    group.classList.toggle('active', isActive);
    group.classList.toggle('hidden', !isActive);
  });
}

async function switchProviderFromModel(model) {
  selectedModel = model;
  await chrome.storage.local.set({ selectedModel: model });
  const nextProvider = mapModelToProvider(model);
  aiProvider = nextProvider;
  await chrome.storage.local.set({ aiProvider: aiProvider });
  updateApiKeyHelp();
  apiKeyInput.value = getApiKey();
  createAgent();
}

function createModelAgent() {
  const modelConfig = getCurrentModelConfig();
  if (!modelConfig) {
    agent = null;
    return;
  }

  if (modelConfig.provider === 'local') {
    agent = new LocalAgent();
    if (backgroundPort) agent.setBackgroundPort(backgroundPort);
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    agent = null;
    return;
  }

  agent = new Agent({
    apiKey,
    responseType: 'MODEL_RESPONSE',
    callType: 'CALL_MODEL',
    timeout: 45000
  });

  agent.model = selectedModel;

  if (backgroundPort) agent.setBackgroundPort(backgroundPort);
}

// Initialize connection to background script
function initConnection() {
  // Don't create a new connection if we already have one
  if (isPortConnected && backgroundPort) {
    return;
  }

  backgroundPort = chrome.runtime.connect({ name: 'devtools-panel' });
  isPortConnected = true;
  statusElement.textContent = 'Connexion à CodePen…';
  statusElement.className = 'status-disconnected';

  if (agent) agent.setBackgroundPort(backgroundPort);

  backgroundPort.postMessage({
    type: 'INIT',
    tabId: tabId
  });

  backgroundPort.onMessage.addListener((message) => {
    if (message.type === 'CONTENT_READY') {
      // Clear chat on page reload
      messagesContainer.innerHTML = '';
      conversationHistory = [];
      refreshCode().catch((error) => {
        updateStatus(false);
        addSystemMessage('Error: ' + error.message);
      });
    }

    if (message.type === 'ERROR' && !message.requestId) {
      addSystemMessage('Error: ' + message.error);
    }
  });

  backgroundPort.onDisconnect.addListener(() => {
    isPortConnected = false;
    if (agent) agent.setPortConnected(false);
    updateStatus(false);
    setTimeout(() => {
      if (!isPortConnected) {
        initConnection();
      }
    }, 1000);
  });

  setTimeout(() => {
    refreshCode().catch((error) => {
      updateStatus(false);
      addSystemMessage('Connexion CodePen impossible : ' + error.message);
    });
  }, 1000);
}

// Load saved API key
async function loadSettings() {
  const result = await chrome.storage.local.get(['apiKeys', 'claudeApiKey', 'geminiApiKey', 'aiProvider', 'selectedModel']);
  if (result.apiKeys && typeof result.apiKeys === 'object') apiKeys = result.apiKeys;
  if (result.claudeApiKey && !apiKeys.claude) apiKeys.claude = result.claudeApiKey;
  if (result.geminiApiKey && !apiKeys.gemini) apiKeys.gemini = result.geminiApiKey;
  if (result.aiProvider) {
    aiProvider = result.aiProvider;
  }

  if (result.selectedModel) {
    selectedModel = LEGACY_LOCAL_MODELS.has(result.selectedModel)
      ? 'local-chrome'
      : result.selectedModel;

    if (selectedModel !== result.selectedModel) {
      await chrome.storage.local.set({ selectedModel });
    }

    if (freeProviderSelect.querySelector(`option[value="${selectedModel}"]`)) {
      freeProviderSelect.value = selectedModel;
      showProviderTab('free');
    } else if (paidProviderSelect.querySelector(`option[value="${selectedModel}"]`)) {
      paidProviderSelect.value = selectedModel;
      showProviderTab('paid');
    } else {
      const shouldUseFreeTab = aiProvider === 'local' || aiProvider === 'gemini';
      showProviderTab(shouldUseFreeTab ? 'free' : 'paid');
      selectedModel = shouldUseFreeTab ? freeProviderSelect.value : paidProviderSelect.value;
      await chrome.storage.local.set({ selectedModel });
    }
  } else {
    const shouldUseFreeTab = aiProvider === 'local' || aiProvider === 'gemini';
    showProviderTab(shouldUseFreeTab ? 'free' : 'paid');
    selectedModel = shouldUseFreeTab ? freeProviderSelect.value : paidProviderSelect.value;
  }

  updateApiKeyHelp();
  apiKeyInput.value = getApiKey();
  createAgent();
}

// Create agent based on selected model
function createAgent() {
  createModelAgent();
}

function createRequestId() {
  requestSequence += 1;

  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `panel-${globalThis.crypto.randomUUID()}`;
  }

  return `panel-${Date.now()}-${requestSequence}`;
}

function requestBackground(type, responseType, payload = {}, timeout = 5000) {
  if (!backgroundPort || !isPortConnected) {
    return Promise.reject(new Error('Not connected to background script'));
  }

  const port = backgroundPort;
  const requestId = createRequestId();

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      port.onMessage.removeListener(messageHandler);
      port.onDisconnect.removeListener(disconnectHandler);
    };

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };

    const messageHandler = (message) => {
      if (!message || message.requestId !== requestId) return;

      if (message.type === responseType) {
        settle(resolve, message);
      } else if (message.type === 'ERROR') {
        settle(reject, new Error(message.error || `${type} failed`));
      }
    };

    const disconnectHandler = () => {
      settle(reject, new Error('Connection lost. Please try again.'));
    };

    port.onMessage.addListener(messageHandler);
    port.onDisconnect.addListener(disconnectHandler);
    timeoutId = setTimeout(() => {
      settle(reject, new Error(`${type} timed out`));
    }, timeout);

    try {
      port.postMessage({ ...payload, type, requestId });
    } catch (error) {
      settle(reject, error);
    }
  });
}

async function updateLocalAiHelp() {
  const modelAtStart = selectedModel;

  if (!('LanguageModel' in globalThis)) {
    apiKeyHelp.textContent = 'Chrome AI est indisponible dans ce navigateur.';
    return;
  }

  apiKeyHelp.textContent = 'Vérification de Chrome AI…';

  try {
    const availability = await globalThis.LanguageModel.availability();
    if (selectedModel !== modelAtStart) return;

    if (availability === 'unavailable') {
      apiKeyHelp.textContent = 'Chrome AI est indisponible sur cet appareil.';
    } else if (availability === 'downloading') {
      apiKeyHelp.textContent = 'Le modèle Chrome AI est en cours de téléchargement.';
    } else if (availability === 'downloadable') {
      apiKeyHelp.textContent = 'Le modèle Chrome AI sera téléchargé au premier usage.';
    } else {
      apiKeyHelp.textContent = 'Chrome AI est prêt et s’exécute localement.';
    }
  } catch (error) {
    if (selectedModel === modelAtStart) {
      apiKeyHelp.textContent = `Impossible de vérifier Chrome AI : ${error.message}`;
    }
  }
}

// Update API key help text based on selected model
function updateApiKeyHelp() {
  const modelConfig = getCurrentModelConfig();
  if (!modelConfig || modelConfig.provider === 'local') {
    settingsTitle.textContent = 'Paramètres Chrome AI';
    apiKeyInput.style.display = 'none';
    apiKeyLabel.style.display = 'none';
    saveSettingsBtn.style.display = 'none';
    void updateLocalAiHelp();
    return;
  }

  apiKeyInput.style.display = '';
  apiKeyLabel.style.display = '';
  saveSettingsBtn.style.display = '';

  const keyLabel = KEY_HELP[modelConfig.provider] || 'Clé API';
  settingsTitle.textContent = `${modelConfig.label} Settings`;
  apiKeyLabel.textContent = `${keyLabel} :`;
  const link = HELP_LINKS[modelConfig.provider];
  apiKeyHelp.innerHTML = link
    ? `Obtenez votre clé depuis <a href="${link}" target="_blank" rel="noopener noreferrer">le tableau de bord fournisseur</a>`
    : 'Saisissez votre clé API pour ce fournisseur.';
}

// Save API key
async function saveSettings() {
  const modelConfig = getCurrentModelConfig();
  if (!modelConfig || modelConfig.provider === 'local') {
    createAgent();
    addSystemMessage('Settings saved (Local)');
    settingsPanel.classList.add('hidden');
    return;
  }

  const newKey = apiKeyInput.value.trim();
  if (!newKey) {
    addSystemMessage('Please enter a valid API key');
    return;
  }

  const keyId = modelConfig.keyId;
  apiKeys[keyId] = newKey;
  await chrome.storage.local.set({ apiKeys });
  createAgent();
  addSystemMessage(`Settings saved (${modelConfig.label})`);
  settingsPanel.classList.add('hidden');
}

// Update connection status
function updateStatus(connected) {
  if (connected) {
    statusElement.textContent = 'Connected to CodePen';
    statusElement.className = 'status-connected';
  } else {
    statusElement.textContent = 'Not connected';
    statusElement.className = 'status-disconnected';
  }
}

// Request code from CodePen and wait for the matching response.
async function refreshCode() {
  if (refreshCodePromise) return refreshCodePromise;

  const pendingRefresh = (async () => {
    const message = await requestBackground('GET_CODE', 'CODE_DATA', { tabId }, 20000);
    const code = message?.data?.code;

    if (!code || typeof code !== 'object') {
      throw new Error('Invalid code payload received from CodePen');
    }

    currentCode = {
      html: typeof code.html === 'string' ? code.html : '',
      css: typeof code.css === 'string' ? code.css : '',
      js: typeof code.js === 'string' ? code.js : ''
    };
    updateStatus(true);
    return currentCode;
  })();

  refreshCodePromise = pendingRefresh;

  try {
    return await pendingRefresh;
  } finally {
    if (refreshCodePromise === pendingRefresh) refreshCodePromise = null;
  }
}

// Add message to chat
function addMessage(role, content) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message message-${role}`;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  // Format content with collapsible code blocks
  contentDiv.innerHTML = formatMessageContent(content);

  messageDiv.appendChild(contentDiv);
  messagesContainer.appendChild(messageDiv);

  // Scroll to bottom after DOM updates
  scrollToBottom();

  return messageDiv;
}

// Scroll chat to bottom
function scrollToBottom() {
  // Use setTimeout to ensure DOM has updated
  setTimeout(() => {
    chatContainer.scrollTo({
      top: chatContainer.scrollHeight,
      behavior: 'smooth'
    });
  }, 0);
}

// Format SEARCH/REPLACE block as colored diff
function formatDiffBlock(blockContent, escapeHtml) {
  const sections = UpdateParser.parseSearchReplaceSections(blockContent);
  let html = '';

  for (const section of sections) {
    const searchText = section.searchText;
    const replaceText = section.replaceText;

    // Compute character-level diff
    const diff = Diff.diffChars(searchText, replaceText);

    let removeHtml = '';
    let addHtml = '';

    for (const part of diff) {
      const escaped = escapeHtml(part.value);
      if (part.removed) {
        removeHtml += '<span class="diff-highlight-remove">' + escaped + '</span>';
      } else if (part.added) {
        addHtml += '<span class="diff-highlight-add">' + escaped + '</span>';
      } else {
        removeHtml += escaped;
        addHtml += escaped;
      }
    }

    html += '<div class="diff-block">';
    html += '<div class="diff-remove">' + removeHtml + '</div>';
    html += '<div class="diff-add">' + addHtml + '</div>';
    html += '</div>';
  }

  return html;
}

// Format message content with collapsible code blocks
function formatMessageContent(content) {
  // Escape HTML to prevent XSS
  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  const renderMarkdown = (text) => {
    const parsed = marked.parse(text);
    return DOMPurify.sanitize(parsed);
  };

  const updateBlocks = UpdateParser.extractUpdateBlocks(content);

  let lastIndex = 0;
  let result = '';

  for (const block of updateBlocks) {
    if (block.start > lastIndex) {
      const textBefore = content.substring(lastIndex, block.start);
      result += renderMarkdown(textBefore);
    }

    const language = block.marker.replace('UPDATE_', '').toLowerCase();
    const blockContent = block.content;

    const hasSearchReplace = UpdateParser.parseSearchReplaceSections(blockContent).length > 0;

    // Check if this is a SEARCH/REPLACE block or complete code
    if (hasSearchReplace) {
      // Format as SEARCH/REPLACE diff with colored view
      const diffHtml = formatDiffBlock(blockContent, escapeHtml);
      result += `<details open>
        <summary>${language.toUpperCase()} Changes</summary>
        <div class="diff-view">${diffHtml}</div>
      </details>`;
    } else {
      // Format as complete code
      result += `<details open>
        <summary>${language.toUpperCase()} Code</summary>
        <pre><code>${escapeHtml(blockContent)}</code></pre>
      </details>`;
    }

    lastIndex = block.end;
  }

  // Add remaining text after last code block (render as markdown)
  if (lastIndex < content.length) {
    const textAfter = content.substring(lastIndex);
    result += renderMarkdown(textAfter);
  }

  return result;
}

// Add system message
function addSystemMessage(content) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message message-system';
  messageDiv.textContent = content;
  messagesContainer.appendChild(messageDiv);
  scrollToBottom();
}

// Add thinking indicator
function addThinkingMessage(providerName = 'AI') {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message message-assistant';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content thinking';
  contentDiv.innerHTML = `<span class="thinking-label">Reading current code... Calling ${providerName}...</span> <span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>`;

  messageDiv.appendChild(contentDiv);
  messagesContainer.appendChild(messageDiv);
  scrollToBottom();

  return messageDiv;
}

function detectProjectContextHints(code) {
  const hints = [];

  if (code.js.includes('THREE.') || code.js.includes('three')) {
    hints.push('This project uses Three.js.');
  }

  if (code.js.includes('React') || code.js.includes('react')) {
    hints.push('This project uses React.');
  }

  if (code.js.includes('Vue') || code.js.includes('createApp(')) {
    hints.push('This project uses Vue.');
  }

  return hints;
}

async function getConsoleErrors() {
  try {
    const message = await requestBackground(
      'GET_CONSOLE_ERRORS',
      'CONSOLE_ERRORS',
      { tabId },
      1500
    );
    return Array.isArray(message.errors) ? message.errors : [];
  } catch (error) {
    return [];
  }
}

function getSelectedScopes() {
  const scopes = { html: false, css: false, js: false };
  scopeInputs.forEach((input) => {
    scopes[input.value] = input.checked;
  });
  return scopes;
}

// Send message to AI provider
async function sendMessage() {
  if (isRequestInFlight) return;

  const message = userInput.value.trim();
  if (!message) return;

  if (!agent) {
    const providerName = getCurrentModelConfig()?.label || 'provider';
    const message = getCurrentModelConfig()?.provider === 'local'
      ? 'Chrome AI est indisponible. Vérifiez son état dans les paramètres.'
      : `Please set your ${providerName} API key in settings`;
    addSystemMessage(message);
    settingsPanel.classList.remove('hidden');
    return;
  }

  isRequestInFlight = true;

  // Add user message to chat
  addMessage('user', message);
  userInput.value = '';
  sendBtn.disabled = true;

  // Add thinking indicator
  const thinkingMessage = addThinkingMessage(getCurrentModelConfig()?.label || 'AI');

  try {
    // Never call a model with a guessed or stale editor snapshot.
    await refreshCode();

    const projectHints = detectProjectContextHints(currentCode);
    const consoleErrors = await getConsoleErrors();
    const scopes = getSelectedScopes();
    const systemPrompt = buildSystemPrompt({ projectHints, consoleErrors, scopes });

    conversationHistory.push({
      role: 'user',
      content: message
    });

    // Call AI provider API
    const response = await agent.sendMessage(systemPrompt, conversationHistory);

    // Remove thinking indicator
    thinkingMessage.remove();

    // Add assistant response
    addMessage('assistant', response);

    // Add to history (strip out UPDATE blocks to avoid confusion)
    const responseWithoutCode = UpdateParser.stripUpdateBlocks(response);
    conversationHistory.push({
      role: 'assistant',
      content: responseWithoutCode || 'Code updated.'
    });

    const updateBlocks = UpdateParser.extractUpdateBlocks(response);
    const enabledMarkers = new Set(
      Object.entries(scopes)
        .filter(([, enabled]) => enabled)
        .map(([scope]) => `UPDATE_${scope.toUpperCase()}`)
    );
    const applicableUpdateBlocks = updateBlocks.filter((block) => enabledMarkers.has(block.marker));

    if (updateBlocks.length === 0) {
      if (assistantMode === 'edit') {
        addSystemMessage(
          'Aucune injection effectuée : la réponse du modèle ne contient aucun bloc UPDATE_HTML, UPDATE_CSS ou UPDATE_JS.'
        );
      }
    } else if (applicableUpdateBlocks.length === 0) {
      addSystemMessage(
        'Aucune injection effectuée : les blocs UPDATE reçus ciblent uniquement des éditeurs désactivés dans les scopes.'
      );
    } else {
      // The user may edit the pen while the model is responding. Re-read the
      // editors so SEARCH blocks are applied only to the latest state.
      await refreshCode();

      const errors = await processAssistantResponse(response, scopes);

      if (errors && errors.length > 0) {
        const errorMessage = 'The following SEARCH blocks could not be applied to the current code:\n\n' +
          errors.join('\n\n') +
          '\n\nPlease check the CURRENT CODE section and try again with exact, unique text.';

        conversationHistory.push({
          role: 'user',
          content: errorMessage
        });
        addSystemMessage(`Aucune injection effectuée : ${errors.join(' | ')}`);
      }
    }

  } catch (error) {
    addSystemMessage('Error: ' + error.message);
    console.error('Chrome Code request failed:', error);
  } finally {
    thinkingMessage.remove();
    isRequestInFlight = false;
    sendBtn.disabled = false;
  }
}

// Build system prompt with current CodePen code
function buildSystemPrompt({ projectHints = [], consoleErrors = [], scopes = { html: true, css: true, js: true } } = {}) {
  const modeInstruction = assistantMode === 'explain'
    ? 'User selected explain mode. Explain the current code and requested changes only. Do not output any UPDATE blocks.'
    : 'User selected edit mode. Apply requested changes using UPDATE markers only for enabled scopes.';

  const refactorInstruction = refactorOnly
    ? 'Refactor-only mode is ON. You may improve readability/structure, but do not change behavior.'
    : 'Refactor-only mode is OFF.';

  const enabledScopes = Object.entries(scopes).filter(([, enabled]) => enabled).map(([scope]) => scope.toUpperCase()).join(', ') || 'NONE';
  const contextSection = projectHints.length > 0 ? projectHints.join('\n') : 'No framework hint detected.';
  const errorsSection = consoleErrors.length > 0 ? consoleErrors.join('\n') : 'No recent console errors captured.';

  return `You are an AI coding assistant integrated into Chrome DevTools for CodePen. You can read and modify the code in the CodePen editor.

=== CURRENT CODE IN EDITOR (always fresh, always up-to-date) ===

HTML:
\`\`\`html
${currentCode.html || '(empty)'}
\`\`\`

CSS:
\`\`\`css
${currentCode.css || '(empty)'}
\`\`\`

JavaScript:
\`\`\`javascript
${currentCode.js || '(empty)'}
\`\`\`

=== PROJECT CONTEXT ===
${contextSection}

=== RECENT CONSOLE ERRORS ===
${errorsSection}

=== USER MODE ===
${modeInstruction}
${refactorInstruction}
Enabled scopes: ${enabledScopes}

=== END CURRENT CODE ===

CRITICAL: The code shown above is the ACTUAL, CURRENT state of the CodePen editor RIGHT NOW. Always use this code as your reference, not code from previous messages in the conversation. This code is refreshed on every request.

When the user asks you to modify code:
1. FIRST: Look at the CURRENT CODE section above to see what's actually in the editor
2. Respond with a clear explanation of what you've done (use past tense)
3. Use special markers to indicate code changes using SEARCH/REPLACE blocks:
   - [UPDATE_HTML]...[/UPDATE_HTML]
   - [UPDATE_CSS]...[/UPDATE_CSS]
   - [UPDATE_JS]...[/UPDATE_JS]
4. Inside the markers, use this format for each change:
   <<<SEARCH>>>
   exact code to find and replace (copy EXACTLY from CURRENT CODE above)
   <<<REPLACE>>>
   new code to replace with

Example:
User: "Change the background to blue"
You: "I've updated the CSS to change the background to blue.

[UPDATE_CSS]
<<<SEARCH>>>
background: red;
<<<REPLACE>>>
background: blue;
[/UPDATE_CSS]"

Important:
- Do not use markdown formatting in your responses. Write plain text without bold, italics, lists, or code blocks (except for the UPDATE markers above).
- ALWAYS refer to the CURRENT CODE section at the top - it's always up-to-date
- IGNORE any code from previous messages - ONLY use the CURRENT CODE section above
- SEARCH blocks must match the CURRENT CODE EXACTLY (including all whitespace and indentation)
- Copy-paste from the CURRENT CODE section to ensure exact matches
- You can have multiple SEARCH/REPLACE pairs in one UPDATE block
- Keep SEARCH blocks small and focused - just the lines you need to change
- If a scope is disabled, do not include that UPDATE block
- If explain mode is enabled, never output UPDATE blocks

Be concise and helpful. Focus on the specific changes requested.`;
}

// Process assistant response and update CodePen if needed
async function processAssistantResponse(response, scopes = { html: true, css: true, js: true }) {
  const updates = {
    html: scopes.html ? PatchEngine.applySearchReplace(currentCode.html, response, 'UPDATE_HTML') : null,
    css: scopes.css ? PatchEngine.applySearchReplace(currentCode.css, response, 'UPDATE_CSS') : null,
    js: scopes.js ? PatchEngine.applySearchReplace(currentCode.js, response, 'UPDATE_JS') : null
  };

  const allErrors = Object.values(updates)
    .filter(Boolean)
    .flatMap((result) => result.errors || []);

  // A response is planned atomically: if one SEARCH is missing or ambiguous,
  // no editor is touched.
  if (allErrors.length > 0) return allErrors;

  const operations = Object.entries(updates)
    .filter(([, result]) => result && result.code !== null)
    .map(([editor, result]) => ({
      editor,
      originalCode: currentCode[editor],
      newCode: result.code,
      changedLines: result.lines
    }));

  const appliedOperations = [];

  try {
    for (const operation of operations) {
      await updateCodePenEditor(operation.editor, operation.newCode, operation.changedLines);
      appliedOperations.push(operation);
    }
  } catch (error) {
    const rollbackFailures = [];

    for (const operation of appliedOperations.reverse()) {
      try {
        await updateCodePenEditor(operation.editor, operation.originalCode, []);
      } catch (rollbackError) {
        rollbackFailures.push(operation.editor.toUpperCase());
      }
    }

    // Reconcile the local snapshot even when an acknowledgement was lost.
    await refreshCode().catch(() => {});

    const rollbackDetail = rollbackFailures.length > 0
      ? ` Rollback failed for: ${rollbackFailures.join(', ')}.`
      : '';
    throw new Error(`CodePen update failed: ${error.message}.${rollbackDetail}`);
  }

  for (const operation of operations) {
    currentCode[operation.editor] = operation.newCode;
    addSystemMessage(`Updated ${operation.editor.toUpperCase()} editor`);
  }

  return null;
}

// Update CodePen editor
async function updateCodePenEditor(editor, newCode, changedLines = []) {
  const message = await requestBackground(
    'UPDATE_CODE',
    'UPDATE_RESULT',
    { tabId, editor, code: newCode, changedLines },
    10000
  );

  if (message.success !== true) {
    throw new Error(`The ${editor} editor did not confirm the update`);
  }

  return true;
}

// Event listeners
modeBtn.addEventListener('click', () => {
  assistantMode = assistantMode === 'edit' ? 'explain' : 'edit';
  modeBtn.textContent = `Mode: ${assistantMode === 'edit' ? 'Edit' : 'Explain'}`;
});

refactorOnlyInput.addEventListener('change', () => {
  refactorOnly = refactorOnlyInput.checked;
});

sendBtn.addEventListener('click', sendMessage);

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
});

saveSettingsBtn.addEventListener('click', saveSettings);

providerTabs.forEach((button) => {
  button.addEventListener('click', () => {
    showProviderTab(button.dataset.tab);
  });
});

freeProviderSelect.addEventListener('change', async () => {
  await switchProviderFromModel(freeProviderSelect.value);
  addSystemMessage(`Modèle sélectionné : ${freeProviderSelect.options[freeProviderSelect.selectedIndex].text}`);
});

paidProviderSelect.addEventListener('change', async () => {
  await switchProviderFromModel(paidProviderSelect.value);
  addSystemMessage(`Modèle sélectionné : ${paidProviderSelect.options[paidProviderSelect.selectedIndex].text}`);
});

// Initialize in a deterministic order so the selected model and credentials are
// loaded before the runtime port is attached to an agent.
async function initialize() {
  await loadSettings();
  initConnection();
}

initialize().catch((error) => {
  addSystemMessage('Error: ' + error.message);
  updateStatus(false);
});
