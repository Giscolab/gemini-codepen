# Architecture — Chrome Code (aperçu)

Ce document décrit l'architecture générale du projet et le rôle des principaux fichiers.

Résumé du flux principal

1. DevTools panel (panel.html / panel.js)
   - UI pour l'utilisateur, construction du prompt système, orchestration des appels IA et application des patches.
   - Initialise une connexion runtime vers le service worker via `chrome.runtime.connect()`.
   - Envoie les messages: `GET_CODE`, `CALL_MODEL` (via Agent), `CALL_LOCAL` (via LocalAgent), `UPDATE_CODE`.

2. Background service worker (background.js)
   - Point central de routage entre le panneau DevTools et la page inspectée / fournisseurs IA.
   - Gère les connexions long‑running (`chrome.runtime.onConnect`), revoie des messages au panel et appelle les fournisseurs (cloud/local).
   - Implémente les handlers: `GET_CODE`, `GET_CONSOLE_ERRORS`, `UPDATE_CODE`, `CALL_MODEL`, `CHECK_LOCAL_AI`, `CALL_LOCAL`.
   - Contient la configuration `MODEL_ENDPOINTS` (mapping modèle → endpoint / provider).

3. Content script (content.js)
   - Pont entre le service worker (background) et le code injecté dans la page.
   - Reçoit les commandes `GET_CODE`, `UPDATE_CODE` et interagit avec l'environnement CodePen.

4. Inject (main world) (inject.js)
   - S'exécute dans le main world pour accéder directement aux éditeurs CodePen (CodeMirror 5/6).
   - Lit / écrit le contenu des éditeurs et applique les surlignages de lignes modifiées.

5. Parser / utilitaires (js/updateParser.js, js/diff.min.js, js/marked.min.js, js/purify.min.js)
   - `updateParser.js` : extraction des blocs `[UPDATE_*]`, parsing des paires `<<<SEARCH>>>` / `<<<REPLACE>>>`, normalisation des fences.
   - `diff.min.js` : calculs de différences pour l'affichage dans le panneau.
   - `marked` + `DOMPurify` : rendu Markdown et sanitization pour l'UI.

6. Agents (js/agents/Agent.js, js/agents/LocalAgent.js)
   - `Agent` : wrapper côté panel pour envoyer `CALL_MODEL` au background et attendre `MODEL_RESPONSE`.
   - `LocalAgent` : spécialisation qui utilise `CALL_LOCAL` / `LOCAL_RESPONSE` et timeouts plus longs.

Messages et protocoles clés

- API du panneau → background (via Port):
  - INIT { tabId }
  - GET_CODE { tabId }
  - GET_CONSOLE_ERRORS { tabId }
  - UPDATE_CODE { tabId, editor, code, changedLines }
  - CALL_MODEL { model, apiKey, systemPrompt, messages }
  - CHECK_LOCAL_AI
  - CALL_LOCAL { messages, systemPrompt }

- background → panel (via Port):
  - CODE_DATA { code }
  - CONSOLE_ERRORS { errors }
  - MODEL_RESPONSE { response }
  - LOCAL_RESPONSE { response }
  - ERROR { error }
  - LOCAL_AI_STATUS { available }

Remarques opérationnelles

- Timeouts: Agent cloud : 45s (panel.js / Agent config), LocalAgent : 60s.
- Le background centralise les appels API cloud (évite d'exposer les clés côté page) et adapte les headers selon le fournisseur.
- L'application des patches suit la logique : extraire UPDATE blocks → parse SEARCH/REPLACE → appliquer sur currentCode → calculer lignes modifiées → appeler UPDATE_CODE.
- Pour toute extension des fournisseurs, mettre à jour `MODEL_ENDPOINTS` (background.js) et `MODEL_CONFIG` (panel.js).

Fichiers importants

- `manifest.json` — permissions et host_permissions
- `devtools.html`, `devtools.js` (si présent) — initialisation du panneau DevTools
- `panel.html`, `panel.css`, `panel.js` — UI et orchestration
- `background.js` — logique service worker et mapping modèles
- `content.js`, `inject.js` — accès et modifications de la page CodePen
- `js/updateParser.js` — parsing des blocs UPDATE
- `js/agents/Agent.js`, `js/agents/LocalAgent.js` — abstraction d'appel modèle
- `tests/updateParser.test.js` — tests unitaires du parser

Où creuser encore

- `background.js` : implémentation détaillée par provider (formats d’appel, headers spécifiques)
- `inject.js` / `content.js` : code responsable du surlignage visuel (highlighting)

