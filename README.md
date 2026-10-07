# Mapping Navision → Business Central

Cet outil remplit un package de configuration Business Central (fichier Excel) avec les données d'un export Navision. Vous indiquez quelle colonne Navision alimente chaque champ BC, vous corrigez les valeurs si besoin, puis vous téléchargez le package prêt à importer.

L'outil tient dans un seul fichier, `nav-2-bc.html`. Il s'ouvre par double-clic dans Edge ou Chrome, sans installation ni connexion. Les données restent sur votre ordinateur.

## Ce qu'il vous faut

- **L'export Navision** (.xlsx ou .csv) : une feuille par table, avec les noms de colonnes sur la première ligne.
- **Le package BC de référence** (.xlsx) : exporté depuis *Packages de configuration* dans Business Central. L'outil reprend sa structure à l'identique.
- **Un modèle de mapping** (.json, facultatif) : un mapping enregistré lors d'une session précédente.

## Utilisation pas à pas

### 1. Charger les fichiers

Sur l'écran d'accueil, déposez ou sélectionnez l'export Navision puis le package BC. Si vous avez un modèle de mapping, vous le chargerez ensuite avec **Importer le mapping**, en haut de l'espace de travail.

Pour remplacer un fichier plus tard, cliquez sur son nom en haut de l'écran.

L'espace de travail comporte trois panneaux : les tables à gauche, les correspondances au centre, le détail du champ à droite. Faites glisser l'espace entre deux panneaux pour les élargir. Un double-clic rétablit la largeur par défaut.

### 2. Choisir la source de chaque table

La colonne de gauche liste les tables du package BC. Pour chaque table, une barre indique la part de champs alimentés et un badge le nombre de lignes source retenues. La couleur du badge donne l'état des contrôles : vert sans anomalie, orange en cas d'alerte, rouge en cas d'erreur.

À droite du nom de la table, au centre, deux listes permettent de choisir :

- **la feuille source Navision** (l'outil propose celle dont le nom correspond). Les noms de colonnes doivent figurer sur sa première ligne ;
- **le sort des données déjà présentes dans le package** :
  - *Remplacer par la source* : seules les lignes Navision sont conservées ;
  - *Ajouter à l'existant* : les lignes Navision s'ajoutent à celles du package ;
  - *Laisser inchangées* : la table est recopiée telle quelle.

### 3. Associer les champs

En mode **Correspondances**, chaque ligne est un champ BC. Cliquez sur la source pour choisir une colonne Navision.

Au choix de la feuille source, si aucun champ de la table n'est encore alimenté, l'outil associe les colonnes dont le nom correspond ou ressemble. Vérifiez ces associations et changez-les au besoin.

Un champ peut être alimenté de quatre façons :

| Source | Effet |
|---|---|
| Colonne | La valeur d'une colonne Navision. |
| Constante | La même valeur sur toutes les lignes. |
| Combinaison | Plusieurs colonnes assemblées, par exemple `{Nom} {Prénom}`. |
| Aucune | Le champ reste vide ou reçoit la valeur par défaut BC. |

Les boutons *Alimentés*, *Non alimentés* et *Anomalies* ainsi que le champ **Rechercher** aident à parcourir les longues tables.

### 4. Ajuster les valeurs

Sélectionnez un champ pour ouvrir le panneau de droite. Vous pouvez :

- **Remplacer des valeurs** : pour les champs *Option* et *Booléen*, et pour toute colonne d'au plus 10 valeurs distinctes, l'outil liste les valeurs de la colonne et vous indiquez par quoi remplacer chacune (par exemple « Homme » et « Femme » deviennent « Personne »). Pour un booléen, « Oui » et « Non » sont remplacés d'office par `true` et `false`. Pour les autres champs, la liste est vide au départ : **Ajouter une valeur** permet de choisir, parmi les valeurs de la colonne, celles à remplacer.
- **Mettre en forme** : remplacer un texte par un autre au début, à la fin ou partout (par exemple le `S` initial par `00` : `S20343` devient `0020343`), compléter à gauche jusqu'à une longueur (par exemple `42` devient `0000042`), ajouter un préfixe ou un suffixe, changer la casse, définir une valeur si la source est vide.
- **Appliquer un axe analytique** : le menu **Axe analytique** de la section *Correspondance des valeurs* remplit la correspondance à partir de la table **Analytique** (barre du haut) : chaque axe département de la colonne est remplacé par son axe *Agence* ou *Activité*. Les codes sont comparés sans tenir compte des zéros de tête (`033011` = `33011`) ; une valeur déjà remplacée sur le champ prend la valeur de l'axe, et le nombre de valeurs absentes de la table est indiqué. La table analytique se remplit en collant les lignes copiées depuis Excel (axe département, nom, axe agence, axe activité) et s'enregistre avec le mapping.
- **Copier et coller la mise en forme** d'un champ à l'autre.

Sous la source, le panneau affiche les lignes en anomalie. Ces sections se replient d'un clic sur leur titre. Repliées, elles gardent l'essentiel en résumé : le nombre d'anomalies ou la mise en forme appliquée. Pour voir le résultat ligne à ligne, utilisez le mode **Résultat**.

Le mode **Résultat** montre la table telle qu'elle sera écrite dans le package. La colonne du champ sélectionné y est mise en évidence. Cliquez sur un en-tête de colonne pour régler ce champ. Dans ce mode, **Rechercher** ne garde que les lignes qui contiennent le texte cherché. Toutes les colonnes restent affichées : les valeurs trouvées et les noms de champs ou de colonnes correspondants sont surlignés. Un clic sur une ligne la met en évidence, pour la suivre plus facilement à l'écran.

**Ajouter une ligne** crée, dans ce même mode, une ligne saisie à la main : utile pour un enregistrement absent de Navision ou une table sans feuille source. Les lignes ajoutées apparaissent en tête, marquées `+1`, `+2`…, et sont écrites avant celles de la source. Saisissez directement la valeur BC de chaque champ : les options et booléens proposent leurs valeurs, une cellule vide reçoit la valeur par défaut BC (affichée en grisé), et une valeur acceptée est ramenée au format BC en quittant la cellule (majuscules pour un code, par exemple). **Entrée** passe à la ligne suivante, ou en crée une après la dernière. La croix, au survol du numéro, supprime la ligne. Ces lignes sont contrôlées comme les autres, clé primaire comprise, et enregistrées avec le mapping. Elles ne sont écrites que si la table est remplacée ou complétée : une table sans feuille source passe d'elle-même en *Ajouter à l'existant*.

### 5. Filtrer les lignes

Par défaut, toutes les lignes de la feuille Navision sont reprises. Pour n'en garder qu'une partie, utilisez la colonne **Filtre** d'un champ alimenté par une colonne ou une combinaison :

1. Cliquez sur le bouton à entonnoir du champ. La liste des valeurs présentes s'ouvre, avec leur nombre d'occurrences. Comme dans Excel, toutes les valeurs sont cochées tant qu'il n'y a pas de filtre.
2. Décochez les valeurs à écarter. La case à gauche de **Rechercher…** coche ou décoche d'un coup toutes les valeurs affichées : avec une recherche, elle ne porte que sur les résultats. **Effacer** retire le filtre.

Le bouton affiche alors les valeurs retenues. Si plusieurs champs sont filtrés, une ligne n'est conservée que si elle passe tous les filtres. Le nombre de lignes retenues apparaît dans le badge de la table, dans la colonne de gauche. Les contrôles, les Résultat et le package généré ne tiennent compte que de ces lignes ; les lignes ajoutées à la main ne sont pas filtrées.

### 6. Vérifier les anomalies

L'outil contrôle chaque valeur par rapport au type du champ BC (texte, code, date, nombre, booléen, option) et à sa longueur maximale :

- **en rouge, les erreurs** : la valeur ne peut pas être importée (date invalide, option inconnue, texte trop long…) ;
- **en orange, les alertes** : la valeur a été modifiée (tronquée, par exemple).

Les doublons et les valeurs vides sur la clé primaire sont aussi signalés. Par défaut, la clé est le premier champ. L'icône de clé, à droite du type en haut du détail d'un champ, ajoute ce champ à la clé ou l'en retire ; dorée, elle signale un champ de la clé, ici comme dans la liste des champs.

### 7. Générer le package

Cliquez sur **Générer le package**. Un récapitulatif indique, pour chaque table, la source, le nombre de Résultat et l'état des contrôles. Une case à cocher devant chaque table choisit celles à générer : toutes sont cochées au départ, la case de l'en-tête coche ou décoche tout, et un clic sur la ligne suffit. Une table décochée est laissée inchangée dans le fichier, et ses anomalies sont exclues du rapport. Vous pouvez télécharger un **rapport des anomalies** (CSV) pour les corriger dans Navision.

Le fichier produit s'appelle `<nom du package>_rempli_<date>.xlsx`. Les valeurs encore en erreur sont laissées vides, sauf les options inconnues, qui sont écrites telles quelles.

### 8. Importer dans Business Central

Dans *Packages de configuration*, ouvrez le package, lancez **Importer d'Excel** et sélectionnez le fichier généré. Contrôlez ensuite les erreurs dans *Données du package* avant d'appliquer.

## Options

Le bouton **Options** permet d'abord de choisir l'**apparence** : *Clair*, *Sombre* ou *Suivre l'appareil* (le thème du système Windows). Ce choix est propre à votre navigateur.

Il propose ensuite des réglages de génération, enregistrés avec le mapping :

- **Compléter les champs vides avec les valeurs par défaut BC** (`false`, `0`, première option…), déduites des lignes déjà présentes dans le package.
- **Tronquer les valeurs trop longues** au lieu de les signaler en erreur.
- **Mettre en majuscules les champs de type Code**, comme le fait Business Central.
- **Ignorer les lignes entièrement vides** de la source.

## Enregistrer son travail

Le mapping en cours est sauvegardé automatiquement dans le navigateur, avec sa table analytique. Il est rattaché au nom exact du fichier export Navision : en rechargeant un export du même nom, le mapping est repris ; un export portant un autre nom démarre d'un mapping neuf (les 20 derniers fichiers sont conservés). Cette sauvegarde est liée à l'emplacement du fichier HTML : si vous le déplacez ou le renommez, elle n'est plus retrouvée.

Pour conserver ou partager un mapping, cliquez sur **Exporter le mapping** (ou Ctrl+S). Vous obtenez un fichier .json nommé d'après l'export Navision (par exemple `export nav 0510 fosmed.xlsx` donne `export_nav_0510_fosmed_mapping.json`), qui contient les correspondances, les mises en forme, les filtres, les lignes ajoutées à la main, la table analytique et les options de génération. Un mapping enregistré avec les anciennes fonctions *Correspondances globales* ou *Modèles de correspondance* est repris : leurs correspondances sont ajoutées à celles de chaque champ concerné, pour les valeurs présentes dans sa colonne. Vous le rechargerez avec **Importer le mapping**, par exemple pour traiter un nouvel export Navision avec les mêmes règles.

## Raccourcis clavier

| Touche | Action |
|---|---|
| ↑ / ↓ | Passer au champ précédent ou suivant |
| Entrée ou F2 | Choisir la colonne source du champ |
| Suppr | Retirer la source du champ |
| Ctrl+S | Exporter le mapping |
| Échap | Fermer le sélecteur de colonne |

## Format des valeurs écrites

Les valeurs sont écrites comme dans un export BC : dates au format `AAAA-MM-JJ`, décimaux avec un point, booléens `true` ou `false`, options par leur libellé. Les dates vides de Navision (01/01/1753) deviennent des champs vides.

## Construire le fichier HTML

Le code source se trouve dans `src/`. Pour produire `dist/nav-2-bc.html`, lancez avec Node.js :

```
node build.js
```

C'est ce fichier qu'il faut distribuer aux utilisateurs. Pendant le développement, `src/index.html` s'ouvre aussi directement dans le navigateur.
