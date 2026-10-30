# Parcours professeur, révision des cas et pilotage synchrone

## Un parcours visible du PRC à la séance

Le tableau de bord explique les quatre étapes : préparer le cas, recueillir le panel, valider le corrigé et le barème, organiser la séance. La distinction est explicite : **Mes PRC** pour le contenu et les corrigés, **Mes séances** pour la participation, l’animation et les bilans.

Dans l’éditeur et le panel, l’étape actuelle et la prochaine action utilisent l’état réel du PRC. Le guide signale les modifications non enregistrées et respecte les droits du collaborateur. Il ne crée pas automatiquement de panel ou de séance.

Quand le corrigé est validé, **Préparer une séance avec ce PRC** ouvre le formulaire de séance avec ce cas déjà sélectionné. Le professeur peut ajouter les autres cas et choisir le mode. Le responsable valide toujours explicitement la création. Les accès et lancements individuels déjà disponibles restent utilisables.

## Revoir un cas depuis son bilan

Chaque cas dont la restitution est disponible propose **Revoir mes réponses et le corrigé** dans le bilan personnel. Une page dédiée présente le scénario, les données, les réponses enregistrées, les corrections et le score sur le maximum du cas. **Retour au bilan de la séance** retrouve les résultats globaux.

La révision est en lecture seule : aucun formulaire de réponse, aucune modification de la copie et aucun changement du cas actif ou de la progression.

L’API `GET /api/participant/teaching-session/cases/{position}/results` résout exclusivement la copie du membre connecté dans sa séance. Aucun identifiant d’un autre étudiant n’est accepté. En synchrone, le cas doit être publié. En asynchrone, la copie de ce cas doit être soumise, ou le professeur doit avoir publié le cas à la clôture. Un cas futur n’est pas révélé avant cette autorisation ; un cas exclu de l’évaluation n’ouvre pas de corrigé. Une copie non soumise reste sans note. Les experts ayant soumis peuvent revoir leur contribution sans recevoir de note étudiante.

Les données utilisent les versions et les barèmes déjà figés pour la séance. La révision ne modifie aucun pointage. La distribution d’un groupe asynchrone reste masquée à l’étudiant jusqu’à sa publication, même lorsqu’il relit un ancien cas.

## Piloter une séance synchrone

Le panneau de suivi regroupe l’étape actuelle, le code, les effectifs inscrits, les soumissions reçues, les copies non soumises et la prochaine action. La barre de progression représente les copies soumises parmi les participants ayant rejoint, sans prétendre mesurer une présence réseau.

En accueil et présentation, les commandes existantes restent à cet endroit. Pendant les réponses, la fermeture et le chronomètre éventuel sont regroupés avec les effectifs. Après fermeture, un raccourci rejoint les commandes de comparaison, de correction ou d’établissement du corrigé. La publication reste une action explicite du professeur.

Le mode asynchrone conserve sa progression individuelle. Le panneau synchrone n’ajoute aucun verrou à ce parcours.

## Installation et vérifications

Ces améliorations n’ajoutent aucune migration ni variable d’environnement. Elles s’appuient sur les migrations de séances 005 et 006 déjà fournies dans `UPGRADE_TEACHING_SESSIONS.sql`.

Les tests PostgreSQL vérifient l’accès personnel, le refus des cas futurs, la publication synchrone, les bilans partiels, les cas non évalués et la conservation de la progression pendant une révision. Les tests navigateur couvrent le guide vers une séance préremplie, la consultation et le retour au bilan, le panneau synchrone et les écrans mobiles. Le parcours complet avec PostgreSQL vérifie également la révision d’un ancien cas après un parcours asynchrone réel.
