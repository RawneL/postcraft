# Postcraft Fluid Studio

Version parallèle de l’éditeur Postcraft, reconstruite sur une base Vite + React + TypeScript + Tailwind CSS v4 avec les composants officiels de [Fluid Functionalism](https://www.fluidfunctionalism.com/).

La version historique située dans le dossier parent n’est pas modifiée par ce projet.

## Démarrer

```bash
npm install
npm run dev
```

Le serveur de développement utilise `http://127.0.0.1:4183/` par défaut.

## Application macOS

Double-cliquez sur **Postcraft Fluid.app** dans ce dossier, ou glissez-la dans le Dock.
Comme le lanceur de la version historique, elle ouvre Terminal, démarre le serveur
sur `http://127.0.0.1:4183/` et ouvre le navigateur par défaut. Gardez Terminal
ouvert pendant l’utilisation ; fermez-le ou faites `Ctrl+C` pour arrêter le serveur.
Enregistrez votre projet JSON avant de quitter.

Vous pouvez copier l’application ailleurs sur ce Mac : elle mémorise le chemin
du projet. Elle nécessite ce dossier, ses dépendances et Node.js 18 ou plus récent ;
elle n’embarque pas le moteur de l’éditeur. L’ancienne application reste indépendante.

Pour reconstruire le lanceur et son icône : `zsh scripts/build-postcraft-app.zsh`.
Pour contrôler ses chemins sans ouvrir de fenêtre :
`"Postcraft Fluid.app/Contents/MacOS/Postcraft" --check`.

## Vérifications du projet

```bash
npm run build
npm run test:project
npm run test:images
```

## Principes d’interface

- canvas vide au démarrage et fenêtre d’accueil proposant une page vierge ou l’ouverture d’un projet JSON ; le mail de démonstration n’est plus chargé automatiquement ;
- nouveaux emails en Helvetica (repli Arial/sans-serif), arrière-plan gris clair, contenu blanc et textes/liens noirs ; les thèmes des projets et presets existants sont conservés ;
- thème neutre de base de Fluid Functionalism : surfaces grises, Inter Variable hébergée localement et sélections monochromes ;
- identité visuelle de l’interface indépendante des couleurs et polices des emails ;
- composants Fluid installés localement via le registre shadcn ;
- boutons, tooltips et onglets animés avec leurs interactions natives ;
- réglages avec les vrais Slider, Select, Switch, ColorPicker et InputGroup Fluid ;
- menus Dropdown, fenêtres Dialog, sections Accordion, messages Banner, modèles Card, statuts Badge et panneaux ScrollArea ;
- panneaux bibliothèque et réglages repliables indépendamment ;
- mode focus avec le canvas seul ;
- raccourcis `Cmd/Ctrl + S`, `Cmd/Ctrl + Z` et `Cmd/Ctrl + Shift + Z` ;
- mise en page utilisable à partir de 960 px de large ;
- moteur MJML, export, projets et presets conservés ;
- canvas et calculs dnd-kit volontairement protégés des transformations animées.

## Structure

- `src/components/ui/` : composants Fluid Functionalism installés localement ;
- `src/editor-controls.tsx` : adaptation des composants Fluid aux valeurs du document et aux libellés accessibles de l’éditeur ;
- `src/lib/` et `src/hooks/` : systèmes Fluid partagés ;
- `src/App.tsx` : interface et orchestration de l’éditeur ;
- `src/components.tsx` : rendu interactif du canvas ;
- `src/emailRenderer.ts` : compilation MJML/HTML ;
- `src/styles.css` : Tailwind, tokens Fluid et styles spécifiques à Postcraft.

## Choix des composants Fluid

Le catalogue de la [documentation](https://www.fluidfunctionalism.com/docs) a été parcouru entièrement. Les composants qui correspondent aux fonctions actuelles sont intégrés, sans ajouter de fonctions artificielles pour utiliser tout le catalogue.

Les sliders compacts permettent le glissement, le clavier et la saisie précise en cliquant leur valeur. Le ColorPicker propose HEX, palette, teinte et alpha. Les sections de réglages se replient ; les menus et dialogues utilisent les primitives accessibles de Fluid.

ChatMessage, InputMessage, ThinkingIndicator, ThinkingSteps, AskUserQuestions, CarouselDots et Table n’ont pas de rôle dans cet éditeur. Combobox, CommandMenu, CheckboxGroup, RadioGroup, InputCopy et TabsSubtle restent disponibles pour de futurs besoins ; les petits choix actuels utilisent Select, Switch ou Tabs. Le Sidebar de navigation ne remplace pas l’arbre MJML spécialisé ni les surfaces de dépôt dnd-kit.

Adaptations locales de compatibilité : Card utilise des liens HTML à la place de `next/link` (Vite), et Slider emploie des refs mutables compatibles React 18. Aucun moteur MJML ni format de projet n’a été changé pour intégrer ces composants.
