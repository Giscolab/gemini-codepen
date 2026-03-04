# Chrome Code

> L’assistant IA qui s’invite dans les DevTools pour discuter avec ton CodePen, comprendre ce que tu veux, et modifier HTML/CSS/JS directement dans les éditeurs.

![Chrome Code Screenshot](screenshot.jpg)

## TL;DR (version terrienne pressée)

- C’est une extension Chrome (Manifest V3) qui ajoute un onglet **Chrome Code** dans DevTools.
- Cet onglet contient un chat.
- Tu demandes une modif (“mets le fond en bleu”, “ajoute une animation”, etc.).
- L’IA répond **et** propose des changements structurés.
- L’extension applique les changements dans CodePen avec une logique de remplacement précise, puis surligne temporairement les lignes touchées.

Si tu es un extraterrestre tombé ici par accident : non, ce n’est pas un IDE complet. C’est un copilote spécialisé CodePen, branché en direct sur les éditeurs de la page.

---

## Pourquoi ce projet existe

Quand on prototype dans CodePen, on alterne souvent entre :
- idées rapides,
- modifications ponctuelles,
- tests visuels,
- et “attends, où est la bonne ligne déjà ?”.

Le but de **Chrome Code** est de réduire la friction :
- tu formules l’intention en langage naturel,
- l’extension lit l’état **actuel** du code,
- l’IA répond en expliquant les changements,
- le code est mis à jour sans copier-coller manuel.

En clair : moins de gymnastique contextuelle, plus d’itérations.

---

## Ce que fait exactement l’extension

### 1) Ajoute un panneau DevTools
Un panneau `Chrome Code` est créé dans DevTools (`devtools.js` + `devtools.html`), puis affiche l’UI de chat (`panel.html`, `panel.css`, `panel.js`).

### 2) Se connecte à la page CodePen inspectée
Le panneau utilise l’ID de l’onglet inspecté et ouvre un port vers le service worker de fond (`background.js`) pour orchestrer les échanges.

### 3) Lit le code en cours dans les éditeurs CodeMirror
- `inject.js` tourne dans le **main world** (même contexte que la page) pour accéder aux instances CodeMirror.
- `content.js` sert de pont (postMessage ↔ runtime messages).
- Résultat : récupération synchronisée de `html`, `css`, `js` depuis le CodePen actif.

### 4) Envoie la demande à un provider IA
Providers supportés :
- **Claude** (API Anthropic)
- **Gemini** (API Google)
- **Local** (Prompt API embarquée de Chrome, via `LanguageModel`)

Les appels réseau partent depuis le service worker (pas depuis le panel), ce qui contourne les blocages CORS côté UI.

### 5) Reçoit une réponse structurée et applique les changements
Le prompt système impose un format de patch basé sur des blocs :
- `[UPDATE_HTML] ... [/UPDATE_HTML]`
- `[UPDATE_CSS] ... [/UPDATE_CSS]`
- `[UPDATE_JS] ... [/UPDATE_JS]`

Chaque bloc contient des paires :
- `<<<SEARCH>>>` (texte exact à trouver)
- `<<<REPLACE>>>` (texte de remplacement)

L’extension applique ces remplacements localement, signale les cas ambigus/non trouvés, pousse les modifications vers CodePen, et met en évidence les lignes modifiées.

### 6) Gère les erreurs et la résilience
- Reconnexion automatique si le port DevTools est coupé.
- Timeout sur les requêtes IA.
- Messages système explicites en cas de clé API manquante, modèle local indisponible, ou mismatch de recherche/remplacement.

---

## Architecture (vue d’ensemble)

```text
DevTools Panel (panel.js)
   │
   │ Port runtime (INIT/GET_CODE/UPDATE_CODE/CALL_*)
   ▼
Background Service Worker (background.js)
   │
   ├──> Claude API / Gemini API / Local LanguageModel
   │
   └──> Message vers onglet CodePen (content.js)
              │
              ▼
         inject.js (main world)
              │
              ▼
      CodeMirror editors (HTML/CSS/JS)
```

---

## Installation

1. Ouvre `chrome://extensions/`
2. Active **Developer mode**
3. Clique sur **Load unpacked**
4. Sélectionne ce dossier

Et voilà : l’extension est chargée.

---

## Configuration

1. Ouvre une page d’édition CodePen (idéalement `codepen.io/pen/...`)
2. Ouvre DevTools (`F12`)
3. Va dans l’onglet **Chrome Code**
4. Choisis ton provider IA : `Claude`, `Gemini` ou `Local`
5. Si provider cloud : ouvre ⚙️ et enregistre la clé API

Liens utiles :
- Claude API key : <https://console.anthropic.com/>
- Gemini API key : <https://aistudio.google.com/apikey>

### Mode Local (sans clé API)
Le mode Local s’appuie sur l’API `LanguageModel` de Chrome.
Si indisponible, active les flags indiqués dans l’UI :
- `chrome://flags/#prompt-api-for-gemini-nano`
- `chrome://flags/#optimization-guide-on-device-model`

---

## Flux d’utilisation recommandé

1. **Demande claire** : “Ajoute un bouton CTA animé en bas à droite.”
2. **Réponse IA** : explication + blocs UPDATE.
3. **Application auto** : remplacement exact dans les éditeurs.
4. **Feedback visuel** : lignes changées surlignées brièvement.
5. **Itération** : “Rends-le plus discret”, “Passe en thème sombre”, etc.

Astuce pratique : fais des demandes ciblées (petites modifs successives), car la logique SEARCH/REPLACE fonctionne mieux avec des remplacements précis qu’avec de grosses réécritures vagues.

---

## Détails techniques importants

### Prompting orienté “source of truth”
À chaque message utilisateur, le système reconstruit un prompt contenant le **code courant réel** (HTML/CSS/JS). L’IA doit s’y référer exclusivement.

Pourquoi c’est utile :
- évite de patcher un ancien état de conversation,
- réduit les hallucinations de lignes “fantômes”,
- rend les modifications plus déterministes.

### Application des patches
La logique d’application :
- cherche chaque bloc `SEARCH` dans le code actuel,
- refuse les correspondances ambiguës (plusieurs occurrences),
- signale les textes introuvables,
- applique les remplacements valides,
- calcule les lignes impactées pour les highlight.

### Stockage local
Les préférences (provider + clés API) sont conservées via `chrome.storage.local`.

### Permissions manifest
L’extension demande principalement :
- `activeTab`
- `storage`
- accès hôte à `codepen.io`, API Anthropic, API Gemini

---

## État d’esprit d’exécution (oui, avec humeur)

Si le projet avait une personnalité, ce serait :
- **Curieux** : il relit le code avant chaque action.
- **Méthodique** : il exige des remplacements exacts.
- **Pragmatique** : il applique ce qui est sûr, signale le reste.
- **Un peu dramatique** : il te dit quand ça ne trouve pas le bon `SEARCH`.
- **Productif après trois cafés** : discussion rapide, cycles courts, feedback immédiat.

---

## Limitations connues

- Dépend de la structure CodePen/CodeMirror attendue (sélecteurs `.box-html`, `.box-css`, `.box-js`).
- Les gros changements en une seule passe peuvent augmenter les échecs de matching exact.
- Le mode Local dépend des capacités expérimentales de ton Chrome.
- L’outil n’est pas un gestionnaire de projet multi-fichiers : il opère sur le Pen ouvert.

---

## Dépannage rapide

### “Not connected” dans le panneau
- Vérifie que tu es bien sur une page d’éditeur CodePen.
- Recharge la page, rouvre DevTools.
- Regarde la console DevTools pour les erreurs runtime.

### “Please set your API key”
- Ouvre ⚙️, colle la clé du provider sélectionné, sauvegarde.

### “Could not find text to replace”
- L’IA a probablement proposé un `SEARCH` qui ne colle pas exactement au code courant.
- Refais une demande en rappelant de cibler un fragment plus petit.

### Mode local indisponible
- Active les flags Chrome mentionnés plus haut.
- Vérifie l’état de disponibilité du modèle local (un téléchargement peut être en cours).

---

## Sécurité & confidentialité (niveau pragmatique)

- Les appels cloud envoient ton message + contexte code au provider choisi.
- Les clés API sont stockées localement via `chrome.storage.local`.
- Aucun backend propriétaire additionnel n’est introduit par ce repo : l’extension parle directement aux APIs configurées.

Si tu manipules du code sensible, préfère le mode Local quand il est disponible.

---

## Structure du dépôt

- `manifest.json` : déclaration extension + permissions + scripts
- `devtools.html` / `devtools.js` : point d’entrée panneau DevTools
- `panel.html` / `panel.css` / `panel.js` : UI chat + logique d’orchestration
- `background.js` : broker messages + appels IA
- `content.js` : pont runtime ↔ page
- `inject.js` : accès CodeMirror en main world
- `js/agents/*` : classes Agent (Claude/Gemini/Local)
- `icons/*` : assets icônes
- `screenshot.jpg` : aperçu

---

## Licence

MIT

Tu peux forker, adapter, expérimenter, et pousser l’idée plus loin (par exemple en ajoutant un mode “prévisualisation de patch” avant application).
