# Répondre et comprendre sa restitution

## Avant de répondre

L’accès par code ou QR conserve l’identification sans création de compte. Une courte introduction distingue la contribution experte et le parcours étudiant : deux impressions cliniques distinctes, le nombre de données attendu, les signes +/−, puis la vérification et la transmission.

Les experts sont informés que leur contribution servira au corrigé et qu’ils ne reçoivent pas de note. Ils attribuent une importance de 1 à 3 à chaque donnée retenue. Pour les étudiants, le message indique quand le corrigé sera accessible selon le mode choisi par le professeur.

## Garder le cas accessible

Le bouton **Revoir le cas** reste accessible pendant la sélection et dans les restitutions. Une fenêtre présente le scénario, les consignes et toutes les données cliniques. Elle se ferme au clavier ou par le bouton Fermer, puis rend le focus au bouton d’origine. La consultation conserve les sélections et la position dans le tableau.

## Répondre sur téléphone

Sur les petits écrans, les étudiants affichent une impression à la fois avec les boutons **Principale** et **Alternative**, chacun accompagné de son compteur. Le tableau conserve les deux ensembles de réponses : passer d’une vue à l’autre ne les réinitialise pas. Une erreur de validation ouvre la vue concernée et place le focus sur le champ à compléter.

Le tableau garde ses deux colonnes d’impressions sur ordinateur. Changer un diagnostic demande toujours de sélectionner à nouveau les données de ce diagnostic, comme auparavant.

Les notes d’importance expertes sont proposées sous forme de boutons **1 · Peu importante**, **2 · Importante**, **3 · Très importante**. Aucun niveau n’est présélectionné. La navigation au clavier est possible, et un changement de signe conserve l’importance déjà attribuée. Les étudiants n’ont pas ces contrôles.

## Vérifier avant de transmettre

**Vérifier et transmettre** valide les choix et termine leur enregistrement. La fenêtre montre ensuite la copie reconnue par le serveur, avec deux fiches : impression, données, signes et importances pour les experts. Chaque fiche permet de revenir modifier l’impression concernée. **Reprendre mes choix** conserve le brouillon.

**Transmettre définitivement** utilise exclusivement la révision et le cas affichés à la vérification. Une modification depuis une autre fenêtre demande une nouvelle vérification. Une fermeture des réponses bloque la transmission ; une copie déjà soumise ailleurs est reconnue comme transmise. Une fermeture sans soumission conserve le statut de brouillon non noté. Les sauvegardes, contrôles d’accès et vérifications serveur existants restent applicables.

## Après la transmission

En synchrone, l’étudiant reçoit un message **Réponse reçue**, avec la comparaison du professeur comme prochaine étape et une mise à jour automatique. En asynchrone, son corrigé et ses points sont accessibles selon l’autorisation déjà choisie par le professeur, sans attendre le groupe.

Le retour personnel **Point fort / À revoir** utilise seulement les corrections déjà révélées pour les impressions choisies. Il reprend les points accordés et les valeurs du barème affiché, y compris les personnalisations. Il ne produit aucune nouvelle interprétation clinique et ne calcule pas une autre note. Si les éléments corrigés obtiennent leur maximum, le message le précise sans présumer de la note des éléments encore masqués.

Pour les experts, les tableaux des deux impressions choisies apparaissent en premier. Les autres tableaux sont disponibles sous **Autres impressions du panel**. Les effectifs, signes, totaux pondérés et leur actualisation conservent leur fonctionnement. La comparaison reste accessible après la soumission de sa propre contribution.

## Installation et validation

Aucune migration, variable d’environnement ou dépendance supplémentaire. Les contrats API et le barème restent identiques.

Les tests navigateur vérifient les sélections mobiles, la consultation du cas, le focus, l’importance sans défaut, la copie canonique à la vérification, les changements de révision, la fermeture par le professeur et une soumission depuis une autre fenêtre. Ils contrôlent aussi la visibilité du retour personnel et les valeurs personnalisées. Le parcours complet sur PostgreSQL couvre les réponses expertes et étudiantes, la correction synchrone et le parcours asynchrone multi-cas.
