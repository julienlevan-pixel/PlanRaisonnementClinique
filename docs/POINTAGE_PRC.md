# Barème personnalisable du professeur

Le professeur trouve le barème dans **Corrigé du panel → Barème personnalisable**. Depuis le PRC, le lien **Consulter ou personnaliser le barème du corrigé** permet de revenir à cet écran.

## Proposition par défaut

- Impression clinique : 3 points pour le diagnostic le plus fréquent du panel (tous les ex æquo), 1 point pour tout autre diagnostic retenu par au moins un expert, 0 sinon.
- Impression clinique alternative : 2 points pour un diagnostic retenu par au moins un expert, 0 sinon.
- Pour chaque diagnostic et chaque signe : 75 % et plus donne 1 point ; 50 % à moins de 75 % donne 0,5 ; moins de 50 % donne 0.
- Le dénominateur est le nombre d’experts ayant retenu ce diagnostic, en principale ou en alternative. Un expert ne choisit pas deux fois le même diagnostic. Les signes + et − sont évalués séparément.
- Les cinq données choisies par impression clinique s’additionnent, avec un plafond de 5 points par impression clinique. Aucun calcul proportionnel supplémentaire n’est appliqué.
- Le plafond proposé est donc **15 points : 3 + 2 + 5 + 5**.

Les notes d’importance expertes de 1 à 3 restent conservées et disponibles pour la discussion. Les points proposés par ce barème sont calculés à partir des fréquences de sélection, et non en multipliant ces notes d’importance.

## Personnaliser

Le professeur peut modifier les points de chaque diagnostic en principale et en alternative, les points de chaque donnée pour les signes + et −, et le plafond clinique par impression clinique. Le maximum se met à jour. Les valeurs acceptent deux décimales, restent positives ou nulles et le total ne dépasse pas 100. Le bouton **Rétablir les valeurs proposées** remet les suggestions dans le formulaire ; **Enregistrer le barème** les applique aux prochains groupes.

Le professeur voit aussi le meilleur score réellement réalisable avec deux diagnostics distincts et cinq données par impression clinique. Si les seuils produisent moins de cinq données créditées, ce score peut être inférieur au plafond annoncé. L’écran le précise pour permettre un ajustement pédagogique ; aucune remise à l’échelle automatique ne transforme une donnée à 0,5 en une donnée à 1.

## Versions et groupes existants

La référence clinique validée conserve ses réponses sources et ses distributions. Seul son modèle de barème pour les prochains groupes est modifiable. Un contrôle de révision empêche deux professeurs d’écraser leurs modifications : après un conflit, le travail local reste visible et **Recharger le barème enregistré** récupère explicitement la dernière version.

Chaque nouveau groupe synchrone ou asynchrone enregistre une copie complète du barème `custom-rubric-v1` dans son questionnaire figé. Tous les étudiants de ce groupe sont corrigés avec cette copie, même ceux qui soumettent après une modification du modèle. Un nouveau groupe peut utiliser la version suivante. Les groupes historiques sur 20, y compris `top-two-v1`, conservent leur règle et leurs notes. Les anciens clients API sans modalité explicite conservent également leur fonctionnement.

La copie du barème reste côté serveur : le formulaire étudiant et l’accès par code reçoivent les plafonds, sans les réponses du solutionnaire. La restitution dévoile les points uniquement selon les étapes synchrones ou après soumission en asynchrone.

## Distribution finale

Le bilan porte sur un PRC et son groupe. L’histogramme, la moyenne, la médiane et les notes extrêmes utilisent le maximum figé de ce groupe, par défaut 15 pour les nouveaux groupes et 20 pour les historiques. Une vraie note de zéro est comptée ; une copie non soumise est exclue.

Après fermeture, le professeur voit un aperçu. **Publier les résultats** partage le graphique anonyme avec les étudiants et la projection. Chaque étudiant voit sa propre tranche. En asynchrone, le corrigé individuel reste immédiat, mais le bilan collectif attend cette publication finale.

## Démonstration Toux et installation

La démonstration conserve dix experts fictifs et les anciennes copies illustratives. Les nouvelles séances utilisent le barème personnalisable. Un accès de démonstration ouvert est réutilisé seulement s’il correspond à la même version de cas et de barème ; une adaptation permet donc d’ouvrir un nouveau groupe sans modifier le précédent.

Aucune nouvelle migration SQL ni variable serveur : les modèles et leurs copies sont enregistrés dans les colonnes JSON existantes. Aucun compte, réponse ou ancien score n’est remplacé.
