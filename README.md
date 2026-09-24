# Mapping Navision → Business Central

Outil autonome pour remplir un package de configuration Business Central (Excel) à partir d'un export brut Navision. Il permet de mapper les colonnes, de formater et convertir les valeurs, de sauvegarder les modèles de mapping et de générer le package.

Le livrable est **un seul fichier HTML** (`dist/Mapping_NAV_BC.html`). Il s'ouvre par double-clic dans Edge ou Chrome, sans installation ni connexion réseau.

## Arborescence

```
nav-bc-mapper/
├─ src/
│  ├─ index.html            Structure de la page (écran d'accueil, espace de travail, dialogues)
│  ├─ styles.css            Styles (thème clair/sombre via variables CSS)
│  └─ js/                   Scripts chargés dans cet ordre :
│     ├─ 01-core.js         État global S, constantes, utilitaires (échappement, colonnes Excel, toasts…)
│     ├─ 02-xlsx-io.js      Lecture .xlsx/.csv bas niveau, chargement du package BC (types, défauts, gabarits)
│     ├─ 03-convert.js      Valeurs source → chaîne, conversions vers les types BC (Date, Decimal, Boolean, Option…)
│     ├─ 04-engine.js       Modèle de mapping, contexte source, compilation des champs, contrôles, mapping auto
│     ├─ 05-persistence.js  Sauvegarde locale (localStorage), import/export JSON du mapping
│     ├─ 06-generate.js     Réécriture XML des feuilles, sharedStrings, tables ; rapport CSV
│     ├─ 07-ui.js           Rendu (tables, grille, aperçu, inspecteur, sélecteur de colonne), événements, dialogues
│     └─ 08-main.js         Chargement des fichiers et démarrage
├─ vendor/
│  └─ jszip.min.js          JSZip 3.10.1 (MIT) : lecture/écriture des archives .xlsx
├─ build.js                 Compilation avec Node.js (sans dépendance)
├─ build.ps1                Compilation avec PowerShell (si Node.js n'est pas installé)
├─ build.cmd                Double-clic : utilise Node si présent, sinon PowerShell
├─ package.json             Raccourcis npm run build / npm run watch
└─ dist/                    Sortie compilée (générée)
```

## Développer

Aucune étape de compilation n'est nécessaire pendant le développement. Ouvrez directement `src/index.html` dans Edge ou Chrome. Après chaque modification d'un fichier de `src/`, rechargez la page avec F5.

Pour déboguer, ouvrez les outils de développement (F12). L'état complet de l'application est exposé dans la variable globale `S` :

- `S.raw` : l'export Navision lu (feuilles et cellules typées).
- `S.pkg` : le package BC, avec ses tables, ses champs (type, longueur, options, valeur par défaut) et le XML d'origine.
- `S.map` : le mapping courant (c'est ce qui est exporté en JSON).
- `S.val` : les résultats des contrôles par table et par champ.

Les scripts sont des scripts classiques, pas des modules ES : ils partagent la même portée globale et doivent rester chargés dans l'ordre de leur numéro. Ce choix permet d'ouvrir la page en `file://` sans serveur, ce que les modules ES interdisent.

## Compiler

La compilation insère le CSS, JSZip et les scripts dans un fichier HTML unique : `dist/Mapping_NAV_BC.html`.

**Option 1 : double-clic.** Lancez `build.cmd`. Il utilise Node.js s'il est installé, sinon PowerShell.

**Option 2 : Node.js (16 ou plus).**

```bat
node build.js
```

Avec npm, `npm run build` fait la même chose. `npm run watch` reconstruit automatiquement à chaque sauvegarde.

**Option 3 : PowerShell seul.**

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

C'est le fichier `dist/Mapping_NAV_BC.html` qu'il faut distribuer aux utilisateurs.

## Points d'attention

**Ne jamais réécrire le package avec une librairie Excel.** Le package BC contient un mappage XML (`xl/xmlMaps.xml`), des tables de type `xml`, des cellules uniques liées (`tableSingleCells`) et des commentaires de type par champ. Excel, openpyxl ou SheetJS perdent ou altèrent ces parties. Pour l'éviter, `06-generate.js` ne modifie que quatre choses :

- la zone `<sheetData>` des feuilles concernées (lignes d'en-tête 1 à 3 conservées) ;
- `<dimension>` ;
- les attributs `ref` des tables et de leur `autoFilter` ;
- `xl/sharedStrings.xml`, reconstruit entièrement, avec les index des feuilles non modifiées renumérotés.

Toutes les autres parties de l'archive sont recopiées à l'identique.

**Types des champs.** Ils sont lus dans les commentaires de la ligne 3 du package, que BC y place à l'export (`Code20`, `Text100`, `Option` suivi de la liste `0: …`). Si un package n'a pas de commentaires, les champs sont traités comme du texte sans limite de longueur.

**Format des valeurs écrites** (identique aux exports BC) : toutes les valeurs sont écrites en texte partagé. Les dates sont au format `AAAA-MM-JJ`, les décimaux utilisent un point, les booléens valent `true`/`false` et les options sont écrites par leur libellé.

**Valeurs par défaut.** Pour les types Boolean, Option, Decimal, Integer et Media, la valeur par défaut est la valeur majoritaire (au moins 60 %) observée dans les lignes déjà présentes dans le package, sinon la valeur neutre du type. Le code est dans `loadPackage`.

**Sauvegarde locale.** Le navigateur associe `localStorage` au fichier ouvert. Si vous déplacez ou renommez le fichier HTML, le dernier mapping n'est plus restauré automatiquement. Pour cette raison, exportez vos modèles en JSON.

**Mettre à jour JSZip.** Remplacez `vendor/jszip.min.js` par la version `dist/jszip.min.js` du paquet npm `jszip`, puis recompilez.

## Format du fichier de mapping (JSON)

```json
{
  "app": "nav-bc-mapper",
  "version": 1,
  "settings": { "fillDefaults": true, "truncate": true, "skipEmpty": true, "upperCode": true },
  "tables": {
    "156 Ressource": {
      "source": "Ressources",
      "headerRow": 1,
      "mode": "replace",
      "fields": {
        "N°":   { "kind": "col", "col": "N°", "padLen": 7, "padChar": "0", "padNum": true },
        "Type": { "kind": "col", "col": "Type", "map": [["Homme", "Personne"], ["Femme", "Personne"]] },
        "Nom de recherche": { "kind": "tpl", "tpl": "{Nom} {Prénom}", "case": "upper" }
      }
    }
  }
}
```

Les clés suivent ces conventions :

- **Tables :** nom de l'onglet du package.
- **Champs :** libellé de la ligne 3 du package. Un libellé en double est suffixé ` (2)`.
- **Colonnes source :** texte de la ligne d'en-tête Navision.
- **`kind` :** `col`, `const` (avec `value`), `tpl` (avec `tpl`) ou `none`.
- **`mode` :** `replace`, `append` ou `keep`.
- **`case` :** `none`, `upper`, `lower` ou `title`.

Les autres propriétés d'un champ sont `prefix`, `suffix` et `dflt` (valeur si vide).

L'ordre d'application sur chaque valeur est le suivant :

1. suppression des espaces ;
2. correspondance de valeurs ;
3. valeur si vide ;
4. casse ;
5. remplissage à gauche ;
6. préfixe et suffixe ;
7. conversion au type BC et contrôle de longueur.

## Vérification après modification

1. Chargez un export Navision et un package, puis vérifiez que le mapping automatique et les compteurs d'anomalies sont cohérents.
2. Générez le package, puis ouvrez-le dans Excel : aucun message de réparation ne doit apparaître et les en-têtes et commentaires doivent être intacts.
3. Dans BC, sur un environnement de test, allez dans *Packages de configuration*, lancez *Importer d'Excel* et contrôlez les erreurs dans *Données du package*.
4. Exportez le mapping, rechargez la page, réimportez-le et vérifiez que le résultat est identique.
