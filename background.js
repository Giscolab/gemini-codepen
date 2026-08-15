// Background service worker for the extension
// Handles communication between DevTools panel and content scripts

// Keep track of active connections
const connections = new Map();
const CLOUD_REQUEST_TIMEOUT_MS = 42000;

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

function postError(port, requestId, error) {
  port.postMessage({
    type: 'ERROR',
    requestId,
    error: getErrorMessage(error)
  });
}

async function readApiError(response, fallbackMessage) {
  let rawBody = '';

  try {
    rawBody = await response.text();
  } catch (error) {
    return `${fallbackMessage} (HTTP ${response.status || 'unknown'})`;
  }

  if (rawBody) {
    try {
      const data = JSON.parse(rawBody);
      const structuredMessage = data?.error?.message || data?.message || data?.error;
      if (typeof structuredMessage === 'string' && structuredMessage.trim()) {
        return structuredMessage.trim();
      }
    } catch (error) {
      // Non-JSON provider and proxy errors are common; use their text below.
    }

    const textMessage = rawBody.replace(/\s+/g, ' ').trim();
    if (textMessage) return textMessage.slice(0, 500);
  }

  return `${fallbackMessage} (HTTP ${response.status || 'unknown'})`;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLOUD_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Provider request timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

const DEEPSEEK_CHAT_COMPLETIONS_URL = 'https://api.deepseek.com/chat/completions';
const MISTRAL_CHAT_COMPLETIONS_URL = 'https://api.mistral.ai/v1/chat/completions';
const PERPLEXITY_CHAT_COMPLETIONS_URL = 'https://api.perplexity.ai/chat/completions';
const XAI_CHAT_COMPLETIONS_URL = 'https://api.x.ai/v1/chat/completions';
const TOGETHER_CHAT_COMPLETIONS_URL = 'https://api.together.xyz/v1/chat/completions';
const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';


const MODEL_ENDPOINTS = {
  'gpt-4o': { api: 'openai', model: 'gpt-4o' },
  'gpt-4.1': { api: 'openai', model: 'gpt-4.1' },
  'gpt-deep-research': { api: 'openai', model: 'o4-mini' },
  'claude-sonnet': { api: 'anthropic', model: 'claude-sonnet-4-5-20250929' },
  'claude-opus': { api: 'anthropic', model: 'claude-opus-4-1-20250805' },
  'gemini-free': { api: 'gemini', model: 'gemini-2.5-flash' },
  'gemini-pro': { api: 'gemini', model: 'gemini-2.5-pro' },
  'deepseek-coder': { api: 'openai_compat', url: DEEPSEEK_CHAT_COMPLETIONS_URL, model: 'deepseek-coder' },
  'deepseek-v3.2': { api: 'openai_compat', url: DEEPSEEK_CHAT_COMPLETIONS_URL, model: 'deepseek-chat' },
  'mistral-large': { api: 'openai_compat', url: MISTRAL_CHAT_COMPLETIONS_URL, model: 'mistral-large-latest' },
  'magistral': { api: 'openai_compat', url: MISTRAL_CHAT_COMPLETIONS_URL, model: 'magistral-medium-latest' },
  'perplexity-pro': { api: 'openai_compat', url: PERPLEXITY_CHAT_COMPLETIONS_URL, model: 'sonar-pro' },
  'perplexity-deep-research': { api: 'openai_compat', url: PERPLEXITY_CHAT_COMPLETIONS_URL, model: 'sonar-deep-research' },
  'grok-reasoning': { api: 'openai_compat', url: XAI_CHAT_COMPLETIONS_URL, model: 'grok-3-mini' },
  'together-mixtral': { api: 'openai_compat', url: TOGETHER_CHAT_COMPLETIONS_URL, model: 'mistralai/Mixtral-8x7B-Instruct-v0.1' },
  'groq-llama': { api: 'openai_compat', url: GROQ_CHAT_COMPLETIONS_URL, model: 'llama-3.3-70b-versatile' },
  'qwen-2.5-coder': { api: 'openai_compat', url: OPENROUTER_CHAT_COMPLETIONS_URL, model: 'qwen/qwen-2.5-coder-32b-instruct' },
  'mistral-small': { api: 'openai_compat', url: OPENROUTER_CHAT_COMPLETIONS_URL, model: 'mistralai/mistral-small-3.2-24b-instruct:free' },
  'k2.5': { api: 'openai_compat', url: OPENROUTER_CHAT_COMPLETIONS_URL, model: 'moonshotai/kimi-k2:free' }
};

async function callOpenAICompatible({ url, apiKey, model, systemPrompt, messages, extraHeaders = {} }) {
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, 'API request failed'));
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty model response');
  return text;
}

async function callOpenAIModel({ apiKey, model, systemPrompt, messages, url = 'https://api.openai.com/v1/chat/completions' }) {
  return callOpenAICompatible({
    url,
    apiKey,
    model,
    systemPrompt,
    messages
  });
}

async function callMistralModel({ apiKey, model, systemPrompt, messages, url = 'https://api.mistral.ai/v1/chat/completions' }) {
  return callOpenAICompatible({
    url,
    apiKey,
    model,
    systemPrompt,
    messages
  });
}

async function callDeepSeekModel({ apiKey, model, systemPrompt, messages, url = 'https://api.deepseek.com/chat/completions' }) {
  return callOpenAICompatible({
    url,
    apiKey,
    model,
    systemPrompt,
    messages
  });
}

async function callGroqModel({ apiKey, model, systemPrompt, messages, url = 'https://api.groq.com/openai/v1/chat/completions' }) {
  return callOpenAICompatible({
    url,
    apiKey,
    model,
    systemPrompt,
    messages
  });
}

async function callPerplexityModel({ apiKey, model, systemPrompt, messages, url = 'https://api.perplexity.ai/chat/completions' }) {
  return callOpenAICompatible({
    url,
    apiKey,
    model,
    systemPrompt,
    messages
  });
}

async function callTogetherModel({ apiKey, model, systemPrompt, messages, url = 'https://api.together.xyz/v1/chat/completions' }) {
  return callOpenAICompatible({
    url,
    apiKey,
    model,
    systemPrompt,
    messages
  });
}

async function callOpenRouterModel({ apiKey, model, systemPrompt, messages, url = 'https://openrouter.ai/api/v1/chat/completions' }) {
  return callOpenAICompatible({
    url,
    apiKey,
    model,
    systemPrompt,
    messages,
    extraHeaders: {
      'HTTP-Referer': 'https://codepen.io/',
      'X-Title': 'Chrome Code Extension'
    }
  });
}

async function callXAIModel({ apiKey, model, systemPrompt, messages, url = 'https://api.x.ai/v1/chat/completions' }) {
  return callOpenAICompatible({
    url,
    apiKey,
    model,
    systemPrompt,
    messages
  });
}

async function callGeminiModel({ apiKey, model, systemPrompt, messages }) {
  const geminiMessages = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: geminiMessages,
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.1
      }
    })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, 'Gemini API request failed'));
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');
  return text;
}

async function callAnthropicModel({ apiKey, model, systemPrompt, messages }) {
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({ model, max_tokens: 4096, system: systemPrompt, messages })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, 'Anthropic API request failed'));
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error('Empty Anthropic response');
  return text;
}

const OPENAI_COMPAT_PROVIDER_BY_URL = {
  'https://api.deepseek.com/chat/completions': 'deepseek',
  'https://api.mistral.ai/v1/chat/completions': 'mistral',
  'https://api.perplexity.ai/chat/completions': 'perplexity',
  'https://api.x.ai/v1/chat/completions': 'xai',
  'https://api.together.xyz/v1/chat/completions': 'together',
  'https://api.groq.com/openai/v1/chat/completions': 'groq',
  'https://openrouter.ai/api/v1/chat/completions': 'openrouter'
};

function resolveProviderFromModelConfig(modelConfig) {
  const directProviderMap = {
    anthropic: 'anthropic',
    gemini: 'gemini',
    openai: 'openai'
  };

  if (directProviderMap[modelConfig.api]) {
    return directProviderMap[modelConfig.api];
  }

  if (modelConfig.api === 'openai_compat') {
    return OPENAI_COMPAT_PROVIDER_BY_URL[modelConfig.url] || 'openai';
  }

  return modelConfig.api;
}

async function callProvider({ provider, apiKey, model, systemPrompt, messages, url }) {
  switch (provider) {
    case 'anthropic':
      return callAnthropicModel({ apiKey, model, systemPrompt, messages });
    case 'gemini':
      return callGeminiModel({ apiKey, model, systemPrompt, messages });
    case 'openai':
      return callOpenAIModel({ apiKey, model, systemPrompt, messages, url });
    case 'mistral':
      return callMistralModel({ apiKey, model, systemPrompt, messages, url });
    case 'deepseek':
      return callDeepSeekModel({ apiKey, model, systemPrompt, messages, url });
    case 'groq':
      return callGroqModel({ apiKey, model, systemPrompt, messages, url });
    case 'perplexity':
      return callPerplexityModel({ apiKey, model, systemPrompt, messages, url });
    case 'together':
      return callTogetherModel({ apiKey, model, systemPrompt, messages, url });
    case 'openrouter':
      return callOpenRouterModel({ apiKey, model, systemPrompt, messages, url });
    case 'xai':
      return callXAIModel({ apiKey, model, systemPrompt, messages, url });
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}


// Handle connections from DevTools panels
chrome.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener(async (message) => {
    if (message.type === 'INIT') {
      connections.set(message.tabId, port);
      return;
    }

    if (message.type === 'GET_CODE') {
      // Forward request to content script
      try {
        const response = await chrome.tabs.sendMessage(message.tabId, {
          type: 'GET_CODE'
        });

        if (!response?.success || !response.code || typeof response.code !== 'object') {
          throw new Error(response?.error || 'Unable to read the CodePen editors');
        }

        port.postMessage({
          type: 'CODE_DATA',
          requestId: message.requestId,
          data: response
        });
      } catch (error) {
        postError(port, message.requestId, error);
      }
    }


    if (message.type === 'GET_CONSOLE_ERRORS') {
      try {
        const response = await chrome.tabs.sendMessage(message.tabId, {
          type: 'GET_CONSOLE_ERRORS'
        });
        port.postMessage({
          type: 'CONSOLE_ERRORS',
          requestId: message.requestId,
          errors: response?.errors || []
        });
      } catch (error) {
        port.postMessage({
          type: 'CONSOLE_ERRORS',
          requestId: message.requestId,
          errors: []
        });
      }
    }

    if (message.type === 'UPDATE_CODE') {
      // Forward code update to content script
      try {
        const response = await chrome.tabs.sendMessage(message.tabId, {
          type: 'UPDATE_CODE',
          editor: message.editor,
          code: message.code,
          changedLines: message.changedLines
        });

        if (!response?.success) {
          throw new Error(response?.error || `Unable to update the ${message.editor} editor`);
        }

        port.postMessage({
          type: 'UPDATE_RESULT',
          requestId: message.requestId,
          success: true
        });
      } catch (error) {
        postError(port, message.requestId, error);
      }
    }

    if (message.type === 'CALL_MODEL') {
      try {
        const modelConfig = MODEL_ENDPOINTS[message.model];
        if (!modelConfig) {
          throw new Error(`Unsupported model: ${message.model}`);
        }

        if (typeof message.apiKey !== 'string' || !message.apiKey.trim()) {
          throw new Error('Missing API key');
        }

        const chatMessages = (message.messages || []).filter((msg) => msg.role === 'user' || msg.role === 'assistant');
        const provider = resolveProviderFromModelConfig(modelConfig);
        const responseText = await callProvider({
          provider,
          apiKey: message.apiKey,
          model: modelConfig.model,
          systemPrompt: message.systemPrompt,
          messages: chatMessages,
          url: modelConfig.url
        });

        port.postMessage({
          type: 'MODEL_RESPONSE',
          requestId: message.requestId,
          response: responseText
        });
      } catch (error) {
        postError(port, message.requestId, error);
      }
    }
  });

  port.onDisconnect.addListener(() => {
    for (const [tabId, p] of connections.entries()) {
      if (p === port) {
        connections.delete(tabId);
        break;
      }
    }
  });
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== 'CONTENT_READY') return false;

  const port = connections.get(sender.tab?.id);
  if (port) {
    port.postMessage({
      type: 'CONTENT_READY'
    });
  }

  // This notification is synchronous and intentionally has no response.
  return false;
});
