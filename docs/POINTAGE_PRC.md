# Pointage actuel et solutionnaire proposé

Le moteur actuel recueille les réponses du panel : deux diagnostics distincts,
cinq données signées (+ ou −) par diagnostic, et une importance de 1 à 3 pour
chaque donnée. Les étudiants choisissent les données et leurs signes, sans
attribuer eux-mêmes de points.

## Calcul actuel

Dans les nouvelles séances synchrones et asynchrones, les réponses expertes
principales et alternatives sont réunies par diagnostic. Un expert ne choisit
pas deux fois le même diagnostic. Pour chaque donnée et chaque signe, on
additionne les importances attribuées par les experts.

- Deux diagnostics dont les fréquences correspondent aux deux meilleurs
  effectifs du panel : 2 points chacun. Les ex æquo sont acceptés.
- Un diagnostic moins fréquent que le deuxième rang conserve un crédit
  partiel de `2 × effectif choisi / effectif du deuxième rang`, plafonné à 1,99.
  Une bonne impression conserve ses points même si l’autre est incorrecte.
- Si deux impressions sont à égalité au deuxième rang et que le seul premier
  est omis, elles se partagent le crédit partiel de la paire : moyenne de
  `2 × effectif / premier effectif` et de 2, plafonnée à 1,99 par diagnostic.
  Cette règle n’avantage ni le rôle principal ni le rôle alternatif.
- Les composantes sont arrondies au centième avant leur addition, pour que
  le détail affiché corresponde à la note totale enregistrée.
- Justification : au maximum 8 points, calculés comme `8 × R / C`.
- `R` est la somme des pondérations expertes correspondant aux cinq données
  et signes choisis par l’étudiant.
- `C` est la somme des cinq plus grandes pondérations directionnelles disponibles,
  en gardant au plus un signe par donnée.
- Diagnostic absent de toutes les réponses expertes : diagnostic et justification
  valent zéro.
- Maximum : 10 points par hypothèse, 20 pour les deux hypothèses.

Pour obtenir 20/20, il faut donc choisir deux diagnostics du top 2 (ex æquo
acceptés) et, pour chacun, cinq données constituant une sélection optimale
avec les bons signes. Les poids sont les sommes des notes expertes de 1 à 3.
Une égalité à la cinquième donnée permet plusieurs sélections optimales.
Si le premier diagnostic est seul en tête, il doit figurer dans la paire
retenue : choisir uniquement deux diagnostics à égalité au deuxième rang
ne donne pas le maximum.
Pour éviter qu’un arrondi affiche un faux plein crédit, une justification
non optimale reste au maximum à 7,99/8 dans ce nouveau barème.

Le barème `top-two-v1` est figé dans chaque nouveau groupe guidé à sa création.
Les anciennes séances gardent leur calcul et les notes déjà enregistrées.
Les anciens groupes guidés donnent encore 2 points à tout diagnostic
représenté ; les groupes historiques sans parcours guidé gardent en plus la
séparation des rôles principal et alternatif.

Les anciens groupes conservent leur règle historique, où les rôles principal
et alternatif restent séparés. Les nouveaux groupes imposent exactement cinq
données par hypothèse ; l’interface et l’API empêchent d’en transmettre plus.

## Comparaison avec le solutionnaire fourni

| Élément | Application actuelle | Exemple fourni |
| --- | --- | --- |
| Sources | Choix des experts et importance de 1 à 3 | Même principe |
| Diagnostic principal | Jusqu’à 2 points, top 2 du panel ; points partiels pour les minorités | Jusqu’à 3 points ; valeur variable selon le diagnostic |
| Diagnostic alternatif | Même règle, sans imposer l’ordre des deux impressions | Jusqu’à 2 points ; liste des réponses acceptées |
| Justification | Pondération proportionnelle, maximum 8 par hypothèse | Valeurs fixes de 0,5 ou 1 par donnée et signe, maximum 5 par hypothèse |
| Maximum total | 20 | 15 : 3 + 2 + 5 + 5 |
| Lecture du panel | Effectifs par signe et sommes des points | Effectifs et ventilation des notes 1, 2 et 3 |
| Choix excédentaires | Saisie bloquée au-delà de cinq | Note de zéro si plus de cinq éléments sont cochés |
| Ajustement pédagogique | Explication du professeur, puis validation d’un calcul figé | L’évaluateur déduit et fixe le barème à partir des réponses expertes |

Les données individuelles de notes 1 à 3 sont enregistrées, mais la ventilation
en trois colonnes n’est pas présentée dans les tableaux actuels. Les sommes
affichées ne suffisent pas à reconstruire cette ventilation sans relire les
réponses individuelles.

Le barème actuel suit donc le principe d’une correction dérivée du panel, mais
ne reproduit pas exactement ce solutionnaire. Les notes expertes de 1 à 3 ne
deviennent pas directement des points étudiants de 0,5 ou 1.

## Évolution recommandée pour reproduire ce modèle

Prévoir un **barème explicite validé par le professeur**, avant l’ouverture des
groupes : valeur de chaque diagnostic selon son rôle, valeur de chaque couple
donnée/signe, plafonds de justification et total. Afficher à côté les effectifs
et la répartition des importances 1, 2 et 3 pour éclairer cette décision. Le
calcul peut suggérer des valeurs, mais le texte fourni ne définit aucun seuil
universel permettant de convertir automatiquement les votes en 0,5 ou 1.

Une telle évolution devra conserver une version du barème dans chaque séance
pour ne pas modifier les notes historiques. Elle n’est pas implémentée par
l’ajout des accès étudiants de démonstration.

## Distribution finale des notes

Le bilan porte sur un PRC et son groupe étudiant. Il affiche un histogramme
de 0 à 20 par tranches de deux points, l’effectif et le pourcentage de chaque
tranche, la moyenne, la médiane, le minimum et le maximum obtenus. Une vraie
note de zéro est comptée. Une copie non soumise ou sans note est exclue et
son exclusion est indiquée.

Après fermeture, le professeur voit un aperçu. **Publier les résultats**
partage le graphique anonyme avec les étudiants et la projection. Chaque
étudiant voit sa propre note et sa tranche ; les noms et copies des pairs ne
sont jamais inclus dans ce bilan. En asynchrone, le corrigé individuel reste
immédiat, mais le bilan collectif attend cette publication finale. Le bilan
ne mélange pas automatiquement des classes ou des PRC distincts.

## Démonstration Toux

L’initialisation prépare dix experts fictifs, avec dix choix pondérés chacun,
un corrigé calculé et validé, quatre copies étudiantes soumises et une copie
en brouillon. Ces anciennes copies servent à illustrer les résultats.

Dans le cas Toux, le professeur peut ensuite ouvrir une séance étudiante
synchrone ou autoriser une séance asynchrone. Chaque modalité possède son code
et ses propres réponses ; les deux utilisent le corrigé déjà calculé. Les
étudiants accèdent au code sans compte et ne peuvent changer de modalité. Une
séance encore ouverte est réutilisée ; une séance terminée reste conservée.

Les dix experts et leurs réponses sont des données de démonstration : ils ne
constituent pas un panel clinique réel. Le passage fourni recommande 15 à 20
cliniciens expérimentés pour construire un solutionnaire pédagogique réel.
