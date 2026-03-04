# Chrome Code

Extension Chrome (Manifest V3).
Ajoute un panneau DevTools pour l’édition assistée par IA des éditeurs CodePen (HTML/CSS/JS).

![Chrome Code Screenshot](screenshot.jpg)

## Vue d’ensemble

Fonctionnement:

1. Lecture du code courant depuis CodePen (HTML/CSS/JS).
2. Construction d’un prompt système avec l’état réel de l’éditeur.
3. Appel du provider IA sélectionné.
4. Parsing des blocs `[UPDATE_*]` avec paires `<<<SEARCH>>>` / `<<<REPLACE>>>`.
5. Application des remplacements valides dans CodeMirror + surlignage temporaire des lignes modifiées.

Périmètre:

- Un Pen CodePen actif.
- Édition incrémentale par remplacements exacts.
- Pas de gestion multi-fichiers/projet.

## Architecture

```text
DevTools panel (devtools.js -> panel.html/panel.js)
  ↕ runtime Port
Background service worker (background.js)
  ↕ chrome.tabs.sendMessage
Content script isolé (content.js)
  ↕ window.postMessage
Script main world (inject.js)
  ↕
CodeMirror CodePen (.box-html/.box-css/.box-js)
```

Composants:

- `devtools.js` : création du panneau DevTools `Chrome Code`.
- `panel.js` : orchestration UI, état, prompt, parsing/appli des patches.
- `background.js` : broker messages + appels IA (cloud/local).
- `content.js` : pont `runtime` ↔ `window.postMessage`.
- `inject.js` : accès direct à CodeMirror dans le main world.
- `js/agents/*` : abstraction provider (`Agent`, `ClaudeAgent`, `GeminiAgent`, `LocalAgent`).

## Contextes d’exécution

- **DevTools panel**: UI chat, réglages, état conversationnel, port runtime.
- **Service worker extension**: routage messages, appels réseau cloud, appels `LanguageModel`.
- **Content script (isolated world)**: reçoit messages background, relaye vers main world.
- **Main world script**: lit/écrit CodeMirror, capture erreurs console récentes.

## Flux de messages

Initialisation:

1. `panel.js` ouvre un port runtime (`INIT`, `tabId`).
2. `content.js` envoie `CONTENT_READY` au background.
3. `background.js` notifie le panel connecté à ce `tabId`.
4. `panel.js` déclenche `GET_CODE`.

Lecture/écriture code:

1. Panel → Background: `GET_CODE` / `UPDATE_CODE`.
2. Background → Tab: `chrome.tabs.sendMessage(...)`.
3. Content → Inject: `window.postMessage(action)`.
4. Inject exécute (`getAllCode`, `setCode`, `getConsoleErrors`) puis renvoie la réponse.

Appel IA:

1. Panel construit prompt système + historique.
2. Agent envoie `CALL_CLAUDE` / `CALL_GEMINI` / `CALL_LOCAL`.
3. Background exécute l’appel provider.
4. Background renvoie `*_RESPONSE`.
5. Panel parse les blocs `UPDATE_*`, applique les remplacements, pousse `UPDATE_CODE`.

## Modèle d’état

État principal géré côté `panel.js`:

- `aiProvider`: provider actif (`claude`, `gemini`, `local`).
- `claudeApiKey` / `geminiApiKey`: clés API stockées en local.
- `agent`: instance active (`ClaudeAgent`, `GeminiAgent`, `LocalAgent`).
- `conversationHistory`: historique messages envoyé au provider.
- `currentCode`: snapshot courant `{ html, css, js }`.
- `assistantMode`: `edit` ou `explain`.
- `refactorOnly`: booléen, contrainte de non-changement comportemental.
- `scopes`: activation par cible (`html`, `css`, `js`).
- `backgroundPort` + `isPortConnected`: état de connectivité runtime.

Persistance:

- `chrome.storage.local`: `claudeApiKey`, `geminiApiKey`, `aiProvider`.

## Intégration IA

| Provider | Mode | Clé API requise | Exécution |
|---|---|---|---|
| Claude | Cloud | Oui | `fetch` depuis `background.js` |
| Gemini | Cloud | Oui | `fetch` depuis `background.js` |
| Local | Navigateur | Non | `LanguageModel` dans `background.js` |

Détails techniques:

- Claude:
  - Endpoint: `https://api.anthropic.com/v1/messages`
  - Modèle: `claude-sonnet-4-5-20250929`
- Gemini:
  - Endpoint: `.../models/gemini-2.5-flash:generateContent`
  - Mapping rôles: `assistant -> model`, `user -> user`
- Local:
  - Vérifie `LanguageModel` + `LanguageModel.availability()`
  - Session éphémère via `LanguageModel.create(...)` puis `session.prompt(...)`

Protocole de patch imposé:

- Blocs: `[UPDATE_HTML]`, `[UPDATE_CSS]`, `[UPDATE_JS]`
- Paires internes: `<<<SEARCH>>>` / `<<<REPLACE>>>`
- Règles:
  - correspondance exacte,
  - refus des occurrences ambiguës,
  - signalement des `SEARCH` introuvables,
  - application partielle des remplacements valides.

## Modèle de sécurité

Permissions (`manifest.json`):

- Extension: `activeTab`, `storage`
- Hosts: CodePen + Anthropic API + Google Generative Language API

Isolation et surface d’échange:

- Accès DOM/CodeMirror uniquement via `inject.js` en main world.
- Pont inter-contextes via `window.postMessage` avec tags `source` dédiés.
- Le script injecté ignore les messages hors fenêtre courante (`event.source !== window`).

Rendu UI:

- Markdown assistant: `marked` + sanitization `DOMPurify`.
- Blocs code: échappement HTML avant insertion.

Données:

- Clés API stockées localement (`chrome.storage.local`).
- En mode cloud, prompt + contexte code sont envoyés au provider choisi.
- Aucun backend applicatif propre au repo.

## Gestion des défaillances

Mécanismes implémentés:

- **Perte de port runtime**: reconnexion automatique panel (retry ~1s).
- **Timeout requête provider**: timeout agent (30s cloud, 60s local).
- **Timeout bridge content↔inject**: résolution nulle après 3s.
- **Éditeurs non prêts**: boucle de vérification (jusqu’à 10 tentatives, 1s).
- **Patch ambigu**: rejet si `SEARCH` présent plusieurs fois.
- **Patch introuvable**: erreur remontée + message système + feedback dans historique.
- **Provider local indisponible/téléchargement en cours**: erreurs explicites.

## Développement

Arborescence:

- `manifest.json`
- `devtools.html`, `devtools.js`
- `panel.html`, `panel.css`, `panel.js`
- `background.js`
- `content.js`
- `inject.js`
- `js/agents/Agent.js`, `ClaudeAgent.js`, `GeminiAgent.js`, `LocalAgent.js`

Chargement local:

1. `chrome://extensions`
2. Activer *Developer mode*
3. *Load unpacked*
4. Sélectionner le dossier du repo

## Limitations

- Couplage à la structure DOM CodePen et à CodeMirror (`.box-html/.box-css/.box-js`).
- Fiabilité dépendante de la qualité des blocs `SEARCH/REPLACE` générés.
- Modifications massives en une passe: risque accru d’échecs de matching.
- Mode local dépend des capacités Chrome (`LanguageModel`) et de flags expérimentaux.
- Conçu pour un Pen actif; pas de synchronisation multi-onglets/projets.

## Licence

MIT (`LICENSE`).
