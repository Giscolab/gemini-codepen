// Background service worker for the extension
// Handles communication between DevTools panel and content scripts

// Keep track of active connections
const connections = new Map();

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
  const response = await fetch(url, {
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
    const error = await response.json();
    throw new Error(error.error?.message || error.message || 'API request failed');
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

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: geminiMessages,
      generationConfig: { maxOutputTokens: 8192 }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'API request failed');
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');
  return text;
}

async function callAnthropicModel({ apiKey, model, systemPrompt, messages }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
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
    const error = await response.json();
    throw new Error(error.error?.message || 'API request failed');
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
        port.postMessage({
          type: 'CODE_DATA',
          data: response
        });
      } catch (error) {
        port.postMessage({
          type: 'ERROR',
          error: error.message
        });
      }
    }


    if (message.type === 'GET_CONSOLE_ERRORS') {
      try {
        const response = await chrome.tabs.sendMessage(message.tabId, {
          type: 'GET_CONSOLE_ERRORS'
        });
        port.postMessage({
          type: 'CONSOLE_ERRORS',
          errors: response?.errors || []
        });
      } catch (error) {
        port.postMessage({
          type: 'CONSOLE_ERRORS',
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
        port.postMessage({
          type: 'UPDATE_RESULT',
          success: response.success
        });
      } catch (error) {
        port.postMessage({
          type: 'ERROR',
          error: error.message
        });
      }
    }

    if (message.type === 'CALL_MODEL') {
      try {
        const modelConfig = MODEL_ENDPOINTS[message.model];
        if (!modelConfig) {
          throw new Error(`Unsupported model: ${message.model}`);
        }

        const chatMessages = (message.messages || []).filter((msg) => msg.role === 'user' || msg.role === 'assistant');
        const provider = resolveProviderFromModelConfig(modelConfig);
        console.log('[CALL_MODEL]', message.model, provider);
        const responseText = await callProvider({
          provider,
          apiKey: message.apiKey,
          model: modelConfig.model,
          systemPrompt: message.systemPrompt,
          messages: chatMessages,
          url: modelConfig.url
        });

        port.postMessage({ type: 'MODEL_RESPONSE', response: responseText });
      } catch (error) {
        port.postMessage({ type: 'ERROR', error: error.message });
      }
    }


    if (message.type === 'CHECK_LOCAL_AI') {
      // Check if Prompt API is available
      try {
        const available = typeof LanguageModel !== 'undefined';
        port.postMessage({
          type: 'LOCAL_AI_STATUS',
          available
        });
      } catch (error) {
        port.postMessage({
          type: 'LOCAL_AI_STATUS',
          available: false
        });
      }
    }

    if (message.type === 'CALL_LOCAL') {
      // Call Prompt API from background
      try {
        if ( typeof LanguageModel === 'undefined' ) {
          throw new Error( 'Built-in AI not available. Enable chrome://flags/#prompt-api-for-gemini-nano' );
        }

        const availability = await LanguageModel.availability();

        if ( availability === 'unavailable' ) {
          throw new Error( 'Built-in AI model unavailable. Check chrome://flags' );
        }

        if ( availability === 'downloading' ) {
          throw new Error( 'Built-in AI model is downloading. Please wait and try again.' );
        }

        // Convert messages to Prompt API format
        const promptMessages = message.messages.map(msg => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        }));

        // Create session with system prompt
        const session = await LanguageModel.create( {
          initialPrompts: [
            { role: 'system', content: message.systemPrompt },
            ...promptMessages
          ]
        } );

        // Get the last user message
        const lastMessage = promptMessages[ promptMessages.length - 1 ];

        if ( !lastMessage || lastMessage.role !== 'user' ) {
          throw new Error( 'No user message to send' );
        }

        // Send message and get response
        const response = await session.prompt( lastMessage.content );

        // Destroy session after use
        session.destroy();

        port.postMessage({
          type: 'LOCAL_RESPONSE',
          response
        });

      } catch (error) {
        port.postMessage({
          type: 'ERROR',
          error: error.message
        });
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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONTENT_READY') {
    const port = connections.get(sender.tab?.id);
    if (port) {
      port.postMessage({
        type: 'CONTENT_READY'
      });
    }
  }
  return true;
});
