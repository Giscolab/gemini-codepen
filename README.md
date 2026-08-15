# Gemini CodePen 2.0

Extension non officielle pour Chrome et Microsoft Edge. Elle ajoute un assistant IA aux DevTools afin de lire, expliquer et modifier directement les fichiers HTML, CSS et JavaScript d’un Pen.

Cette version est conçue pour le nouvel éditeur **CodePen 2.0** utilisant CodeMirror 6. Le panneau apparaît actuellement sous le nom **Chrome Code** dans les DevTools.

## Prérequis

- Chrome ou Microsoft Edge à jour ;
- un Pen ouvert dans l’éditeur CodePen 2.0 ;
- les onglets `index.html`, `style.css` et `script.js` ouverts dans CodePen ;
- une clé API Gemini créée dans [Google AI Studio](https://aistudio.google.com/apikey).

## Installation

1. Sur GitHub, ouvrir le menu **Code**, puis choisir **Download ZIP**.
2. Extraire entièrement l’archive dans un dossier permanent.
3. Ouvrir `chrome://extensions` dans Chrome ou `edge://extensions` dans Edge.
4. Activer le **Mode développeur**.
5. Cliquer sur **Charger l’extension non empaquetée**.
6. Sélectionner le dossier extrait qui contient `manifest.json`.

Ne supprimez pas et ne déplacez pas ce dossier tant que l’extension est installée.

## Configuration de Gemini

1. Ouvrir un Pen dans CodePen 2.0.
2. Ouvrir les DevTools avec `F12` ou `Ctrl` + `Maj` + `I`.
3. Ouvrir l’onglet **Chrome Code**. S’il n’est pas visible, le chercher dans le menu `»` des DevTools.
4. Sélectionner **Gemini Free** ou **Gemini Pro**.
5. Cliquer sur l’icône ⚙️, coller la clé Google AI Studio, puis cliquer sur **Enregistrer**.
6. Attendre l’état **Connected to CodePen**.

## Utilisation

1. Choisir le mode :
   - **Edit** pour autoriser les modifications ;
   - **Explain** pour obtenir uniquement une explication.
2. Cocher seulement les fichiers que Gemini peut modifier : **HTML**, **CSS** et/ou **JS**.
3. Écrire une demande précise, puis cliquer sur **Envoyer**.
4. Vérifier le diff affiché et le résultat dans l’éditeur CodePen avant de sauvegarder le Pen.

En mode Edit, l’extension applique uniquement les remplacements exacts qu’elle peut vérifier. Une modification ambiguë ou introuvable est refusée afin de préserver le code existant.

## Quotas et données

- **Gemini Free nécessite une clé API** : l’offre gratuite de Google reste soumise à des quotas et n’est pas illimitée.
- Chaque envoi peut consommer du quota. Si Gemini renvoie un format inexploitable en mode Edit, l’extension peut effectuer **une unique seconde requête automatique** pour obtenir un correctif applicable.
- Le prompt et le code courant du Pen sont envoyés à l’API du fournisseur choisi.
- Les clés API sont enregistrées localement dans le stockage de l’extension.

## Si CodePen ne se connecte pas

1. Fermer complètement les DevTools.
2. Vérifier que `index.html`, `style.css` et `script.js` sont ouverts dans CodePen 2.0.
3. Recharger l’extension depuis `chrome://extensions` ou `edge://extensions`.
4. Actualiser la page CodePen.
5. Rouvrir les DevTools et attendre la reconnexion automatique.

## Crédits

Gemini CodePen 2.0 est un fork de [Chrome Code](https://github.com/mrdoob/chromecode), créé par [Mr.doob](https://github.com/mrdoob), créateur de [three.js](https://threejs.org/).

Un remerciement spécial à Mr.doob pour le projet d’origine qui a rendu ce fork possible. Les adaptations de ce dépôt ciblent notamment l’éditeur CodePen 2.0 et son intégration CodeMirror 6.

## Licence

Distribué sous licence MIT. Voir [`LICENSE`](LICENSE).
