# Entrée, reprise et progression des participants

## Rejoindre par QR ou par code

Le QR mène directement à `/join/CODE`. La page courte `/rejoindre` et les champs de l’accueil conduisent au même écran de confirmation. Les minuscules, espaces et tirets sont acceptés dans les codes, côté navigateur et côté serveur, y compris pour rejoindre une séance multi-cas sans le tiret du préfixe `S-`. Les anciennes invitations et les codes existants continuent de fonctionner. Les nouveaux codes conservent leur alphabet sans `I`, `O`, `0` ni `1`.

Avant toute inscription, le participant voit le nom de la séance, son rôle, le nom public du professeur, le nombre de cas et la modalité. Il indique ensuite un nom ou pseudonyme et clique sur **Rejoindre la séance**. Aucun compte participant n’est créé. Les consignes détaillées restent accessibles sous **Comment se déroule la participation ?**.

Le nom de l’organisateur est conservé dans les nouveaux lancements. Les séances multi-cas présentent leur organisateur ; les anciens lancements individuels utilisent le responsable du PRC lorsque l’organisateur n’est pas conservé.

Un code inconnu permet de corriger la saisie sur place. Une erreur de service ou de connexion n’est pas présentée comme un code inconnu. Une collecte fermée explique son état ; elle permet toujours la reprise d’une participation reconnue selon les règles existantes.

## Confirmer l’arrivée et retrouver sa copie

La salle d’attente salue le participant avec son propre pseudonyme lorsqu’il est disponible. Elle affiche le nombre de personnes ayant rejoint la collecte et indique la prochaine étape. Ce nombre représente les inscriptions, pas une présence en ligne mesurée. Le professeur voit séparément les inscriptions et les réponses définitives.

L’accueil et `/rejoindre` proposent **Reprendre mon parcours** uniquement lorsqu’un cookie participant valide est reconnu. Une participation d’essai propose **Reprendre mon essai**. Le même accès figure sur la page du code lorsque le cookie appartient à cette séance, sans demander de nouveau le pseudonyme.

`GET /api/participant/resume` renvoie uniquement le nom de la séance et le pseudonyme liés au cookie courant. Sans participation reconnue, il répond `{ "available": false }`. Il ne recherche jamais une copie à partir d’un nom. Les réponses sont privées et non mises en cache. L’utilisation du même navigateur reste nécessaire pour cette reprise ; les invitations individuelles existantes conservent leur fonctionnement.

## Voir où l’on en est

Les participants disposent d’un repère commun adapté à leur rôle et à la modalité : accueil, présentation, réponse puis comparaison du panel pour les experts ; discussion, corrigé et bilan pour les étudiants synchrones. En asynchrone, le repère indique la réponse, le corrigé personnel puis le cas suivant ou le bilan lorsqu’il s’agit d’une séance multi-cas.

La barre de séance conserve le numéro du cas, le nombre total et **Guidé par le professeur** ou **À votre rythme**. Les messages indiquent explicitement s’il faut attendre une action du professeur ou poursuivre soi-même. Ils utilisent uniquement les informations déjà autorisées par le serveur. Aucun corrigé supplémentaire n’est dévoilé et les règles de transmission et de notation restent identiques.

La projection conserve le QR, le code lisible et l’adresse courte de saisie. Après la fermeture des réponses, cet accès devient compact et permet aux participants de retrouver leur propre copie. Aucune identité n’est projetée.

## Tester avant l’accueil

Depuis le suivi d’une collecte ou d’une séance, **Tester l’accès participant** prépare une collecte d’essai. Dans une séance multi-cas, **Cas à tester** permet de vérifier aussi un cas à venir, sans avancer la vraie séance. La création est explicite ; sélectionner un autre cas ne crée rien.

L’essai copie la version clinique figée, le rôle, la modalité, la référence et le barème de la collecte choisie. Il ne reprend pas la dernière version modifiée du PRC. Son code et son QR sont distincts. Il n’appartient pas à la séance réelle et ne crée aucun membre dans celle-ci. Les réponses d’essai sont ouvertes immédiatement pour accéder au questionnaire. **Suivre et piloter l’essai** permet ensuite de fermer la collecte d’essai et d’examiner sa restitution selon la modalité.

Les essais portent le marqueur `is_trial`. Leurs copies restent exclues des résultats et des effectifs réels ; un panel d’essai ne peut pas produire de référence réelle. Les droits de gestion de la collecte source, y compris de tous les PRC d’une séance partagée, sont vérifiés sous verrou avant la création.

## Installation et vérifications

Aucune migration ni variable d’environnement supplémentaire. Les séances multi-cas utilisent les migrations 005 et 006 déjà nécessaires à leur fonctionnement.

Les tests PostgreSQL couvrent la saisie tolérante des codes, la reprise privée, les effectifs, les permissions et les essais de cas figés avec leurs barèmes, même après modification du PRC. Les tests navigateur couvrent l’entrée directe et la saisie, les rôles, les codes inconnus et collectes fermées, la reprise, le QR projeté après fermeture, les essais de cas futurs et la progression asynchrone. Les parcours existants de sélection, de sauvegarde et de notation restent vérifiés.
