# Synthèse des choix du groupe

Le professeur ouvre **Impressions cliniques et données retenues**, dans une collecte étudiante ou en bas d’une séance. Pour une séance multi-cas, **Cas à analyser** permet de retrouver chaque cas, y compris après la fin de la séance. La synthèse fonctionne en synchrone et en asynchrone.

## Lire les graphiques

Les quatre indicateurs présentent les copies définitives, les participations non soumises exclues, l’effectif du panel du corrigé et le nombre d’impressions proposées. Les brouillons ne contribuent jamais aux choix.

Chaque impression est comparée au panel expert du corrigé enregistré pour le groupe. La barre étudiante distingue l’impression principale (partie pleine) et l’impression alternative (partie hachurée). Les effectifs et pourcentages sont écrits à côté des barres : aucune information ne dépend seulement de la couleur. Un étudiant peut sélectionner deux impressions distinctes ; la somme des fréquences des diagnostics atteint donc 200 % sur les copies complètes. Chaque diagnostic reste compris entre 0 et 100 %.

En sélectionnant une impression, le professeur voit toutes les données du cas dans leur ordre d’origine. Les choix **en faveur (+)**, **en défaveur (−)** et **non retenus** utilisent comme dénominateur les étudiants ayant sélectionné cette impression, principale ou alternative. La comparaison experte utilise de même les experts l’ayant retenue. Les deux effectifs peuvent différer.

La recherche accepte les accents ou leur absence. Le tri facultatif **Écarts au panel les plus marqués** met en premier les plus grands écarts de fréquence d’un signe. Ce tri décrit les choix du groupe et ne modifie aucun point. Les notes et les poids d’importance experts de 1 à 3 ne sont pas utilisés comme effectifs.

Une impression sans réponse étudiante est signalée comme telle. Si aucun expert ne l’a retenue, aucune comparaison clinique n’est inventée. Un cas sans copie définitive affiche un état vide, sans faux graphique de réponses à zéro.

## Accès et actualisation

Cette synthèse est uniquement collective : elle ne comporte ni noms, ni identifiants participants, ni copies individuelles. Son endpoint est réservé aux professeurs disposant des droits de gestion sur le cas et sa séance. Elle n’est pas ajoutée aux parcours étudiants ou à la projection.

L’actualisation est active uniquement lorsque la synthèse est ouverte, le cas est ouvert et l’onglet est visible. Le bilan provisoire est identifié. Après fermeture, les choix restent consultables. Chaque changement de cas charge son propre bilan ; les réponses de deux cas ne sont pas mélangées.

Aucune migration Supabase, nouvelle dépendance ou variable d’environnement n’est requise. La fonction lit les copies définitives et la référence figée existantes, sans modifier les réponses, les notes ou le barème.
