# Providers & Modèles

Ce fichier récapitule les fournisseurs et modèles exposés par l'UI et la configuration du projet.

Remarque importante

La source de vérité pour la configuration exacte est le code :
- `background.js` → const MODEL_ENDPOINTS
- `panel.js` → const MODEL_CONFIG

Liste (extraites du code)

MODEL_ENDPOINTS (exemples présents dans background.js)
- gpt-4o: { api: 'openai', model: 'gpt-4o' }
- gpt-4.1: { api: 'openai', model: 'gpt-4.1' }
- gpt-deep-research: { api: 'openai', model: 'o4-mini' }
- claude-sonnet: { api: 'anthropic', model: 'claude-sonnet-4-5-20250929' }
- claude-opus: { api: 'anthropic', model: 'claude-opus-4-1-20250805' }
- gemini-free: { api: 'gemini', model: 'gemini-2.5-flash' }
- gemini-pro: { api: 'gemini', model: 'gemini-2.5-pro' }
- deepseek-coder: { api: 'openai_compat', url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-coder' }
- deepseek-v3.2: { api: 'openai_compat', url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' }
- mistral-large: { api: 'openai_compat', url: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-large-latest' }
- magistral: { api: 'openai_compat', url: 'https://api.mistral.ai/v1/chat/completions', model: 'magistral-medium-latest' }
- perplexity-pro: { api: 'openai_compat', url: 'https://api.perplexity.ai/chat/completions', model: 'sonar-pro' }
- perplexity-deep-research: { api: 'openai_compat', url: 'https://api.perplexity.ai/chat/completions', model: 'sonar-deep-research' }
- grok-reasoning: { api: 'openai_compat', url: 'https://api.x.ai/v1/chat/completions', model: 'grok-3-mini' }
- together-mixtral: { api: 'openai_compat', url: 'https://api.together.xyz/v1/chat/completions', model: 'mistralai/Mixtral-8x7B-Instruct-v0.1' }
- groq-llama: { api: 'openai_compat', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' }
- qwen-2.5-coder: { api: 'openai_compat', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'qwen/qwen-2.5-coder-32b-instruct' }
- mistral-small: { api: 'openai_compat', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'mistralai/mistral-small-3.2-24b-instruct:free' }
- k2.5: { api: 'openai_compat', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'moonshotai/kimi-k2:free' }

MODEL_CONFIG (exemples présents dans panel.js)
- local-ollama: provider: 'local', label: 'Ollama (Local)'
- local-lmstudio: provider: 'local', label: 'LM Studio'
- local-vllm: provider: 'local', label: 'vLLM'
- gemini-free: provider: 'gemini', label: 'Gemini Free'
- qwen-2.5-coder: provider: 'openrouter', label: 'Qwen 2.5 Coder'
- deepseek-coder: provider: 'deepseek', label: 'DeepSeek Coder'
- deepseek-v3.2: provider: 'deepseek', label: 'DeepSeek V3.2'
- mistral-small: provider: 'openrouter', label: 'Mistral Small'
- groq-llama: provider: 'groq', label: 'Groq LLaMA'
- gpt-4o: provider: 'openai', label: 'GPT-4o'
- gpt-4.1: provider: 'openai', label: 'GPT-4.1'
- gpt-deep-research: provider: 'openai', label: 'GPT Deep Research'
- claude-sonnet: provider: 'claude', label: 'Claude Sonnet'
- claude-opus: provider: 'claude', label: 'Claude Opus'
- gemini-pro: provider: 'gemini', label: 'Gemini Pro'
- mistral-large: provider: 'mistral', label: 'Mistral Large'
- magistral: provider: 'mistral', label: 'Magistral'
- perplexity-pro: provider: 'perplexity', label: 'Perplexity Pro'
- perplexity-deep-research: provider: 'perplexity', label: 'Perplexity Deep Research'
- grok-reasoning: provider: 'xai', label: 'Grok Reasoning'
- k2.5: provider: 'openrouter', label: 'K2.5'
- together-mixtral: provider: 'together', label: 'Mixtral (Together)'

Aide pour ajouter un fournisseur

1. Ajouter l'entrée (clé) dans `MODEL_ENDPOINTS` (background.js) avec :
   - api: type logique ("openai", "anthropic", "gemini", "openai_compat", ...)
   - model: identifiant du modèle attendu par l'API
   - url: (optionnel) endpoint custom si `openai_compat`

2. Ajouter la configuration UI dans `MODEL_CONFIG` (panel.js) en indiquant `provider`, `keyId` (clé de stockage) et `label`.

3. Si besoin d'entêtes ou logique spécifiques, adapter/ajouter une fonction d'appel dans `background.js` (ex : callGeminiModel, callAnthropicModel, callOpenAICompatible).

4. Mettre à jour HELP_LINKS et KEY_HELP dans `panel.js` si le fournisseur nécessite un lien ou un libellé de clé.

Notes finales

- Pour la liste la plus à jour, consultez directement `background.js` et `panel.js` dans le dépôt.
