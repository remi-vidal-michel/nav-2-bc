# Mapping Navision → Business Central

Cet outil remplit un package de configuration Business Central (fichier Excel) avec les données d'un export Navision. Vous indiquez quelle colonne Navision alimente chaque champ BC, vous corrigez les valeurs si besoin, puis vous téléchargez le package prêt à importer.

L'outil tient dans un seul fichier, `nav-2-bc.html`. Il s'ouvre par double-clic dans Edge ou Chrome, sans installation ni connexion. Les données restent sur votre ordinateur.

## Ce qu'il vous faut

- **L'export Navision** (.xlsx ou .csv) : une feuille par table, avec les noms de colonnes sur la première ligne.
- **Le package BC de référence** (.xlsx) : exporté depuis *Packages de configuration* dans Business Central. L'outil reprend sa structure à l'identique.
- **Un modèle de mapping** (.json, facultatif) : un mapping enregistré lors d'une session précédente.

## Utilisation pas à pas

### 1. Charger les fichiers

Sur l'écran d'accueil, déposez ou sélectionnez l'export Navision puis le package BC. Si vous avez un modèle de mapping, chargez-le aussi : il sera appliqué dès que les deux fichiers seront ouverts.

Pour remplacer un fichier plus tard, cliquez sur son nom en haut de l'écran.

L'espace de travail comporte trois panneaux : les tables à gauche, les correspondances au centre, le détail du champ à droite. Faites glisser l'espace entre deux panneaux pour les élargir. Un double-clic rétablit la largeur par défaut.

### 2. Choisir la source de chaque table

La colonne de gauche liste les tables du package, avec une barre indiquant la part de champs alimentés. Pour chaque table, choisissez :

- **la feuille source Navision** (l'outil propose celle dont le nom correspond) ;
- **la ligne d'en-tête** si les noms de colonnes ne sont pas sur la première ligne ;
- **le sort des données déjà présentes dans le package** :
  - *Remplacer par la source* : seules les lignes Navision sont conservées ;
  - *Ajouter à l'existant* : les lignes Navision s'ajoutent à celles du package ;
  - *Laisser inchangées* : la table est recopiée telle quelle.

### 3. Associer les champs

En mode **Correspondances**, chaque ligne est un champ BC. Cliquez sur la source pour choisir une colonne Navision.

**Mapper automatiquement** associe les colonnes dont le nom correspond. Une association proposée par simple ressemblance est marquée « à vérifier » : confirmez-la ou changez-la.

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

- **Remplacer des valeurs** : l'outil liste les valeurs distinctes de la colonne et vous indiquez par quoi remplacer chacune. C'est indispensable pour les champs *Option* (par exemple « Homme » et « Femme » deviennent « Personne »).
- **Mettre en forme** : compléter à gauche jusqu'à une longueur (par exemple `42` devient `0000042`), ajouter un préfixe ou un suffixe, changer la casse, définir une valeur si la source est vide.
- **Copier et coller la mise en forme** d'un champ à l'autre.

Sous la source, le panneau affiche les lignes en anomalie puis, pour toutes les lignes, la valeur source et le résultat dans une liste défilante ; les lignes en alerte y sont surlignées en jaune, celles en erreur en rouge. Ces sections se replient d'un clic sur leur titre. Repliées, elles gardent l'essentiel en résumé : le nombre d'anomalies, la mise en forme appliquée ou le nombre de lignes.

Le mode **Aperçu du résultat** montre la table telle qu'elle sera écrite dans le package. La colonne du champ sélectionné y est mise en évidence. Cliquez sur un en-tête de colonne pour régler ce champ. Dans ce mode, **Rechercher** ne garde que les lignes qui contiennent le texte cherché. Toutes les colonnes restent affichées : les valeurs trouvées et les noms de champs ou de colonnes correspondants sont surlignés. Un clic sur une ligne la met en évidence, pour la suivre plus facilement à l'écran.

### 5. Filtrer les lignes

Par défaut, toutes les lignes de la feuille Navision sont reprises. Pour n'en garder qu'une partie, utilisez la colonne **Filtre** d'un champ alimenté par une colonne ou une combinaison :

1. Cliquez sur le bouton à entonnoir du champ. La liste des valeurs présentes s'ouvre, avec leur nombre d'occurrences. Comme dans Excel, toutes les valeurs sont cochées tant qu'il n'y a pas de filtre.
2. Décochez les valeurs à écarter. La case à gauche de **Rechercher…** coche ou décoche d'un coup toutes les valeurs affichées : avec une recherche, elle ne porte que sur les résultats. **Effacer** retire le filtre.

Le bouton affiche alors les valeurs retenues. Si plusieurs champs sont filtrés, une ligne n'est conservée que si elle passe tous les filtres. Le nombre de lignes retenues apparaît sous le titre de la table. Les contrôles, l'aperçu et le package généré ne tiennent compte que de ces lignes.

### 6. Vérifier les anomalies

L'outil contrôle chaque valeur par rapport au type du champ BC (texte, code, date, nombre, booléen, option) et à sa longueur maximale :

- **en rouge, les erreurs** : la valeur ne peut pas être importée (date invalide, option inconnue, texte trop long…) ;
- **en orange, les alertes** : la valeur a été modifiée (tronquée, par exemple).

Les doublons et les valeurs vides sur la clé primaire (premier champ) sont aussi signalés.

### 7. Générer le package

Cliquez sur **Générer le package**. Un récapitulatif indique, pour chaque table, la source, le nombre de lignes finales et l'état des contrôles. Vous pouvez télécharger un **rapport des anomalies** (CSV) pour les corriger dans Navision.

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

Le mapping en cours est sauvegardé automatiquement dans le navigateur. Cette sauvegarde est liée à l'emplacement du fichier HTML : si vous le déplacez ou le renommez, elle n'est plus retrouvée.

Pour conserver ou partager un mapping, cliquez sur **Exporter le mapping** (ou Ctrl+S). Vous obtenez un fichier .json qui contient les correspondances, les mises en forme, les filtres et les options de génération. Vous le rechargerez avec **Importer le mapping**, par exemple pour traiter un nouvel export Navision avec les mêmes règles.

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
