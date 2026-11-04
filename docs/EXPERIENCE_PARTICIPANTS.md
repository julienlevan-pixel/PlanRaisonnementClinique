# Répondre et comprendre sa restitution

## Avant de répondre

L’accueil par code ou QR, la reprise dans le même navigateur, la confirmation de séance, les repères de progression et les essais du professeur sont décrits dans [Accès et progression](ACCES_ET_PROGRESSION.md).

L’accès par code ou QR conserve l’identification sans création de compte. Une courte introduction distingue la contribution experte et le parcours étudiant : deux impressions cliniques distinctes, le nombre de données attendu, les signes +/−, puis la vérification et la transmission.

Les experts sont informés que leur contribution servira au corrigé et qu’ils ne reçoivent pas de note. Ils attribuent une importance de 1 à 3 à chaque donnée retenue. Pour les étudiants, le message indique quand le corrigé sera accessible selon le mode choisi par le professeur.

## Garder le cas accessible

Le bouton **Revoir le cas** reste accessible pendant la sélection et dans les restitutions. Une fenêtre présente le scénario, les consignes et toutes les données cliniques. Elle se ferme au clavier ou par le bouton Fermer, puis rend le focus au bouton d’origine. La consultation conserve les sélections et la position dans le tableau.

## Répondre sur téléphone

Sur les petits écrans, les étudiants et les experts affichent une impression à la fois avec les boutons **Principale** et **Alternative**, chacun accompagné de son compteur. Le tableau conserve les deux ensembles de réponses : passer d’une vue à l’autre ne réinitialise ni les signes ni les importances. Une erreur de validation ouvre la vue concernée et place le focus sur le champ à compléter. La présentation s’applique en synchrone comme en asynchrone, pour les modalités déjà disponibles.

Le tableau garde ses deux colonnes d’impressions sur ordinateur. Changer un diagnostic demande toujours de sélectionner à nouveau les données de ce diagnostic, comme auparavant.

Les notes d’importance expertes sont proposées sous forme de boutons **1 · Peu importante**, **2 · Importante**, **3 · Très importante**. Sur téléphone, les trois boutons sont disposés verticalement pour garder des cibles tactiles lisibles ; sur ordinateur, ils restent côte à côte. Aucun niveau n’est présélectionné. La navigation au clavier est possible, et un changement de signe conserve l’importance déjà attribuée. Les étudiants n’ont pas ces contrôles.

## Prévisualiser les deux parcours

L’aperçu de l’éditeur, chaque cas du récapitulatif de séance et l’exemple public de la toux proposent **Vue étudiant** et **Vue expert**. Le récapitulatif ouvre la vue correspondant au public de la séance ; les autres aperçus commencent en vue étudiant. Changer la vue de l’aperçu ne change jamais le public ou la modalité de la séance préparée.

Les aperçus partagent avec le questionnaire réel le tableau, les consignes de sélection, les signes +/−, les importances réservées aux experts, les compteurs, la consultation du cas et la navigation mobile par impression. Leurs identifiants sont propres à chaque aperçu pour permettre plusieurs cas ouverts simultanément.

Les essais étudiant et expert sont conservés séparément dans chaque aperçu. Changer de vue, d’impression ou consulter le cas conserve ces choix. Ils restent locaux : aucune inscription, sauvegarde de réponse, transmission ni note n’est créée. L’aperçu permet d’essayer la sélection ; le déroulement de séance et la restitution restent disponibles dans les véritables séances d’essai.

## Vérifier avant de transmettre

**Vérifier et transmettre** valide les choix et termine leur enregistrement. La fenêtre montre ensuite la copie reconnue par le serveur, avec deux fiches : impression, données, signes et importances pour les experts. Chaque fiche permet de revenir modifier l’impression concernée. **Reprendre mes choix** conserve le brouillon.

**Transmettre définitivement** utilise exclusivement la révision et le cas affichés à la vérification. Une modification depuis une autre fenêtre demande une nouvelle vérification. Une fermeture des réponses bloque la transmission ; une copie déjà soumise ailleurs est reconnue comme transmise. Une fermeture sans soumission conserve le statut de brouillon non noté. Les sauvegardes, contrôles d’accès et vérifications serveur existants restent applicables.

## Après la transmission

En synchrone, l’étudiant reçoit un message **Réponse reçue**, avec la comparaison du professeur comme prochaine étape et une mise à jour automatique. En asynchrone, son corrigé et ses points sont accessibles selon l’autorisation déjà choisie par le professeur, sans attendre le groupe.

Le retour personnel **Point fort / À revoir** utilise seulement les corrections déjà révélées pour les impressions choisies. Il reprend les points accordés et les valeurs du barème affiché, y compris les personnalisations. Il ne produit aucune nouvelle interprétation clinique et ne calcule pas une autre note. Si les éléments corrigés obtiennent leur maximum, le message le précise sans présumer de la note des éléments encore masqués.

Pour les experts, les tableaux des deux impressions choisies apparaissent en premier. Les autres tableaux sont disponibles sous **Autres impressions du panel**. Les effectifs, signes, totaux pondérés et leur actualisation conservent leur fonctionnement. La comparaison reste accessible après la soumission de sa propre contribution.

## Installation et validation

Aucune migration, variable d’environnement ou dépendance supplémentaire. Les contrats API et le barème restent identiques.

Les tests navigateur vérifient les sélections mobiles étudiantes et expertes, les deux modalités expertes, la consultation du cas, le focus, l’importance sans défaut, la copie canonique à la vérification, les changements de révision, la fermeture par le professeur et une soumission depuis une autre fenêtre. Ils contrôlent aussi les essais indépendants des deux vues d’aperçu, l’absence d’écriture réseau dans l’exemple public, les écrans de 320 et 390 pixels, la visibilité du retour personnel et les valeurs personnalisées. Le parcours complet sur PostgreSQL couvre les réponses expertes et étudiantes, la correction synchrone et le parcours asynchrone multi-cas.
