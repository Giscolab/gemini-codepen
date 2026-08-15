# Sécurité & Permissions

Résumé des choix actuels et recommandations pour éviter les fuites de clés ou les risques XSS.

Permissions (manifest.json)

- permissions: `activeTab`, `storage`
- host_permissions: `https://*.codepen.io/*`, `https://codepen.io/*`, `https://cdpn.io/*`, et divers endpoints API (OpenAI, Anthropic, Mistral, DeepSeek, Groq, Perplexity, Together, OpenRouter, xAI, ...)

Principes de sécurité appliqués

1. Stockage des clés
   - Les API keys sont stockées localement via `chrome.storage.local` (accès restreint à l'extension).
   - Les appels cloud sont effectués depuis le service worker (background.js) — cela évite d'injecter les clés dans la page web.

2. Rendu Markdown et XSS
   - Rendu Markdown côté UI avec `marked`.
   - Nettoyage du HTML rendu via `DOMPurify` avant insertion dans le DOM.

3. Messages inter‑contexts
   - Filtrage strict des messages `window.postMessage` côté `content.js` / `inject.js` par `source` / structure attendue.
   - Communication extension ↔ page isolée : content script / inject séparent les privilèges.

4. Minimiser l’exposure
   - Les endpoints et headers spécifiques sont gérés dans le background worker.
   - Aucune clé API cloud ne doit être écrite dans le `window` du site (pas de `window.__MY_KEY__`).

Risques connus et mitigations

- Changement du DOM CodePen : si CodePen change ses éditeurs/structure, le code d'accès peut exécuter des lectures/écritures incorrectes. Mitigation : tests et validation à chaque modification majeure.
- Modèles mal formatant les blocs SEARCH/REPLACE → application erronée : le parser vérifie la présence des paires et rejette les changements ambigus.
- Fuites de clés si le développeur copie manuellement les clés côté page : documenter clairement que les clés ne doivent jamais être collées dans la console du site.

Recommandations supplémentaires

- Restreindre davantage les host_permissions si vous ne comptez pas utiliser tous les endpoints listés.
- Ajouter une gestion chiffrée des clés si besoin (ex : Web Crypto + storage chiffrée) pour usages sensibles.
- Ajouter des tests E2E sur un ensemble de pens CodePen pour détecter les régressions liées au DOM.

