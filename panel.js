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

// Provider configuration
const MODEL_CONFIG = {
  'local-ollama': { provider: 'local', keyId: null, label: 'Ollama (Local)' },
  'local-lmstudio': { provider: 'local', keyId: null, label: 'LM Studio' },
  'local-vllm': { provider: 'local', keyId: null, label: 'vLLM' },
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
      updateStatus(true);
      refreshCode();
    }

    if (message.type === 'CODE_DATA') {
      currentCode = message.data.code;
      updateStatus(true);
    }

    if (message.type === 'LOCAL_AI_STATUS') {
      if (message.available) {
        apiKeyHelp.innerHTML = 'Uses built-in Chrome AI.';
      } else {
        apiKeyHelp.innerHTML = 'Uses built-in Chrome AI.<br><br>Enable these flags:<br><code>chrome://flags/#prompt-api-for-gemini-nano</code><br><code>chrome://flags/#optimization-guide-on-device-model</code>';
      }
    }

    if (message.type === 'ERROR') {
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
    refreshCode();
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
    selectedModel = result.selectedModel;
    if (freeProviderSelect.querySelector(`option[value="${selectedModel}"]`)) {
      freeProviderSelect.value = selectedModel;
      showProviderTab('free');
    } else if (paidProviderSelect.querySelector(`option[value="${selectedModel}"]`)) {
      paidProviderSelect.value = selectedModel;
      showProviderTab('paid');
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

// Update API key help text based on selected model
function updateApiKeyHelp() {
  const modelConfig = getCurrentModelConfig();
  if (!modelConfig || modelConfig.provider === 'local') {
    settingsTitle.textContent = 'Local Settings';
    apiKeyInput.style.display = 'none';
    apiKeyLabel.style.display = 'none';
    saveSettingsBtn.style.display = 'none';
    apiKeyHelp.innerHTML = 'Uses built-in Chrome AI.';

    if (backgroundPort && isPortConnected) {
      backgroundPort.postMessage({ type: 'CHECK_LOCAL_AI' });
    }
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

// Request code from CodePen
function refreshCode() {
  if (backgroundPort && isPortConnected) {
    try {
      backgroundPort.postMessage({
        type: 'GET_CODE',
        tabId: tabId
      });
    } catch (error) {
      console.error('Error sending GET_CODE message:', error);
      if (error.message.includes('disconnected port')) {
        isPortConnected = false;
        initConnection();
      }
    }
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
  const sections = blockContent.split('<<<SEARCH>>>').filter(s => s.trim());
  let html = '';

  const normalizeBlockText = (text) => text
    .replace(/\r/g, '')
    .replace(/^\n/, '')
    .replace(/\n$/, '');

  for (const section of sections) {
    if (!section.includes('<<<REPLACE>>>')) continue;

    const [searchPart, replacePart] = section.split('<<<REPLACE>>>');
    const searchText = normalizeBlockText(searchPart);
    const replaceText = normalizeBlockText(replacePart.split('<<<')[0]);

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

  // Pattern to match code blocks: [UPDATE_XXX]...[/UPDATE_XXX]
  const codeBlockPattern = /\[UPDATE_(HTML|CSS|JS)\]([\s\S]*?)\[\/UPDATE_\1\]/g;

  let lastIndex = 0;
  let result = '';
  let match;

  while ((match = codeBlockPattern.exec(content)) !== null) {
    // Add text before the code block (render as markdown)
    if (match.index > lastIndex) {
      const textBefore = content.substring(lastIndex, match.index);
      result += renderMarkdown(textBefore);
    }

    const language = match[1].toLowerCase();
    const blockContent = match[2].trim();

    // Check if this is a SEARCH/REPLACE block or complete code
    if (blockContent.includes('<<<SEARCH>>>') && blockContent.includes('<<<REPLACE>>>')) {
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

    lastIndex = match.index + match[0].length;
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
  if (!backgroundPort || !isPortConnected) return [];

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      backgroundPort.onMessage.removeListener(listener);
      resolve([]);
    }, 1000);

    const listener = (message) => {
      if (message.type === 'CONSOLE_ERRORS') {
        clearTimeout(timeout);
        backgroundPort.onMessage.removeListener(listener);
        resolve(Array.isArray(message.errors) ? message.errors : []);
      }
    };

    backgroundPort.onMessage.addListener(listener);
    backgroundPort.postMessage({ type: 'GET_CONSOLE_ERRORS', tabId });
  });
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
  const message = userInput.value.trim();
  if (!message) return;

  if (!agent) {
    const providerName = getCurrentModelConfig()?.label || 'provider';
    const message = getCurrentModelConfig()?.provider === 'local'
      ? 'Local AI not available. Please check Chrome flags.'
      : `Please set your ${providerName} API key in settings`;
    addSystemMessage(message);
    settingsPanel.classList.remove('hidden');
    return;
  }

  // Add user message to chat
  addMessage('user', message);
  userInput.value = '';
  sendBtn.disabled = true;

  // Add thinking indicator
  const thinkingMessage = addThinkingMessage(getCurrentModelConfig()?.label || 'AI');

  // Refresh code before sending
  await new Promise(resolve => {
    if (backgroundPort && isPortConnected) {
      try {
        backgroundPort.postMessage({
          type: 'GET_CODE',
          tabId: tabId
        });
        // Wait a bit for the response
        setTimeout(resolve, 500);
      } catch (error) {
        console.error('Error sending GET_CODE message:', error);
        if (error.message.includes('disconnected port')) {
          isPortConnected = false;
          initConnection();
        }
        resolve();
      }
    } else {
      resolve();
    }
  });

  // Build system prompt with current code
  const projectHints = detectProjectContextHints(currentCode);
  const consoleErrors = await getConsoleErrors();
  const scopes = getSelectedScopes();
  const systemPrompt = buildSystemPrompt({ projectHints, consoleErrors, scopes });

  // Add to conversation history
  conversationHistory.push({
    role: 'user',
    content: message
  });

  try {
    // Call AI provider API
    const response = await agent.sendMessage(systemPrompt, conversationHistory);

    // Remove thinking indicator
    thinkingMessage.remove();

    // Add assistant response
    addMessage('assistant', response);

    // Add to history (strip out UPDATE blocks to avoid confusion)
    const responseWithoutCode = response.replace(/\[UPDATE_(HTML|CSS|JS)\][\s\S]*?\[\/UPDATE_\1\]/g, '').trim();
    conversationHistory.push({
      role: 'assistant',
      content: responseWithoutCode || 'Code updated.'
    });

    // Check if we need to update code
    const errors = await processAssistantResponse(response, scopes);

    // If there were search/replace errors, add them to conversation history
    if (errors && errors.length > 0) {
      const errorMessage = 'The following SEARCH blocks could not be found in the current code:\n\n' +
        errors.join('\n\n') +
        '\n\nPlease check the CURRENT CODE section and try again with the exact code that exists.';

      conversationHistory.push({
        role: 'user',
        content: errorMessage
      });
    }

  } catch (error) {
    // Remove thinking indicator on error
    thinkingMessage.remove();
    addSystemMessage('Error: ' + error.message);
    console.error('Error calling AI provider:', error);
  } finally {
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
    html: scopes.html ? applySearchReplace(currentCode.html, response, 'UPDATE_HTML') : null,
    css: scopes.css ? applySearchReplace(currentCode.css, response, 'UPDATE_CSS') : null,
    js: scopes.js ? applySearchReplace(currentCode.js, response, 'UPDATE_JS') : null
  };

  const allErrors = [];

  for (const [editor, result] of Object.entries(updates)) {
    if (result !== null) {
      if (result.errors && result.errors.length > 0) {
        allErrors.push(...result.errors);
      }
      if (result.code) {
        // Update our local copy
        currentCode[editor] = result.code;
        // Update CodePen with line highlighting
        await updateCodePenEditor(editor, result.code, result.lines);
        addSystemMessage(`Updated ${editor.toUpperCase()} editor`);
      }
    }
  }

  return allErrors.length > 0 ? allErrors : null;
}

// Apply SEARCH/REPLACE blocks to code
function applySearchReplace(currentCode, responseText, marker) {
  const startMarker = `[${marker}]`;
  const endMarker = `[/${marker}]`;
  const startIndex = responseText.indexOf(startMarker);
  const endIndex = responseText.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    return null;
  }

  const blockContent = responseText.substring(startIndex + startMarker.length, endIndex);
  let newCode = currentCode || '';

  const normalizeBlockText = (text) => text
    .replace(/\r/g, '')
    .replace(/^\n/, '')
    .replace(/\n$/, '');

  // Split by <<<SEARCH>>> to find all search/replace pairs
  const sections = blockContent.split('<<<SEARCH>>>').filter(s => s.trim());
  let hasChanges = false;
  const changedLines = new Set();
  const errors = [];

  for (const section of sections) {
    // Check if this section has a <<<REPLACE>>> marker
    if (!section.includes('<<<REPLACE>>>')) {
      continue;
    }

    const [searchPart, replacePart] = section.split('<<<REPLACE>>>');
    const searchText = normalizeBlockText(searchPart);
    const replaceText = normalizeBlockText(replacePart.split('<<<')[0]); // Stop at next marker or end

    const searchIndex = newCode.indexOf(searchText);
    if (searchIndex !== -1) {
      const escapedSearch = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const occurrences = (newCode.match(new RegExp(escapedSearch, 'g')) || []).length;
      if (occurrences !== 1) {
        const editorName = marker.replace('UPDATE_', '');
        const errorMsg = `Ambiguous match in ${editorName}`;
        console.warn(errorMsg);
        errors.push(errorMsg);
        addSystemMessage(`Ambiguous match in ${editorName}`);
        continue;
      }

      // Find which lines were affected
      const beforeSearch = newCode.substring(0, searchIndex);
      const startLine = beforeSearch.split('\n').length - 1;
      const searchLines = searchText.split('\n').length;
      const replaceLines = replaceText.split('\n').length;

      // Mark affected lines
      for (let i = 0; i < Math.max(searchLines, replaceLines); i++) {
        changedLines.add(startLine + i);
      }

      newCode = newCode.replace(searchText, replaceText);
      hasChanges = true;
    } else {
      const editorName = marker.replace('UPDATE_', '');
      const errorMsg = `In ${editorName} editor, could not find:\n${searchText}`;
      console.warn(errorMsg);
      errors.push(errorMsg);
      addSystemMessage(`Could not find text to replace in ${editorName}`);
    }
  }

  // Return result with errors
  if (hasChanges) {
    return { code: newCode, lines: Array.from(changedLines), errors };
  } else if (errors.length > 0) {
    // No changes made, but there were errors
    return { code: null, lines: [], errors };
  } else {
    return null;
  }
}

// Update CodePen editor
async function updateCodePenEditor(editor, newCode, changedLines = []) {
  return new Promise((resolve) => {
    if (backgroundPort && isPortConnected) {
      try {
        backgroundPort.postMessage({
          type: 'UPDATE_CODE',
          tabId: tabId,
          editor: editor,
          code: newCode,
          changedLines: changedLines
        });
      } catch (error) {
        console.error('Error sending UPDATE_CODE message:', error);
        isPortConnected = false;
        if (error.message.includes('disconnected port')) {
          initConnection();
        }
      }
    }
    setTimeout(resolve, 200);
  });
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

// Initialize
loadSettings();
initConnection();

// Check connection status after a delay and show appropriate message
setTimeout(() => {
  const isConnected = statusElement.classList.contains('status-connected');
  if (!isConnected) {
    addSystemMessage('Make sure you are on a CodePen editor page (codepen.io/pen/).');
    addSystemMessage('If status shows "Not connected", check the Console for debugging info.');
  }
}, 1500);
