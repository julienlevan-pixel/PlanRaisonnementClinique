# Vérifier une séance et la piloter au même endroit

## Avant de créer une séance

Dans **Mes séances → Nouvelle séance**, choisir le public, le mode, les cas et leur ordre, puis cliquer sur **Vérifier la séance**.

Le récapitulatif présente le nom, le public, le mode et les cas dans l’ordre choisi. Pour les étudiants, il affiche le maximum réel de chaque barème et leur somme, arrondie à deux décimales. Si le meilleur score réalisable est inférieur au maximum configuré, cette différence est indiquée. Pour un panel expert, il précise que la participation ne reçoit pas de note étudiante.

Chaque cas montre sa version, son état de préparation, les effectifs de diagnostics et de données, et un aperçu repliable du questionnaire. Le professeur peut essayer les choix ; dans l’aperçu expert, il peut aussi essayer les notes d’importance de 1 à 3. Ces interactions restent locales : aucun participant, aucune copie et aucune note d’essai ne sont créés.

**Modifier la préparation** retrouve les champs et l’ordre choisis. **Actualiser le récapitulatif** relit les versions et les barèmes. **Créer la séance** confirme la préparation vérifiée. En synchrone, la salle est alors créée en accueil ; le professeur présente le cas et ouvre les réponses plus tard.

## Cohérence des versions et des points

`POST /api/teaching-sessions/preview` est réservé aux enseignants ayant les droits de gestion sur tous les PRC sélectionnés. Il valide la disponibilité, les versions et les corrigés nécessaires, puis retourne le récapitulatif sans créer de lignes métier.

Le récapitulatif utilise la même sélection de référence validée et le même calcul de barème que la création. La nouvelle interface transmet une empreinte de préparation à la confirmation. Le serveur reprend les verrous des PRC, vérifie les droits et recalcule l’empreinte avant toute insertion. Un changement de contenu, de barème, de référence, d’ordre ou de mode refuse la création avec un message invitant à actualiser. Une création refusée ne laisse aucune séance partielle.

Le champ `preparationToken` reste facultatif pour les anciens clients et scripts. Les séances déjà créées conservent leurs versions et leurs barèmes.

## Pendant une séance synchrone

Le panneau de pilotage indique le numéro et le nom du cas courant. Le suivi nominatif privé, l’étape, le code et les soumissions sont regroupés au même endroit. Ces effectifs comptent les personnes ayant rejoint et leurs copies soumises ; ils ne représentent pas une présence réseau instantanée.

Après fermeture des réponses étudiantes, le panneau donne directement accès à la comparaison des impressions, au choix du corrigé à afficher et à la publication des résultats. Le tableau collectif reste consultable plus bas. Le passage au cas suivant ou au bilan apparaît dans ce même panneau une fois les conditions réunies.

Les règles restent les mêmes : publication avant de poursuivre avec les étudiants, fermeture de collecte avant de poursuivre avec les experts, exclusion explicite d’un cas fermé sans aucune soumission, copies partielles sans note globale artificielle. Le chronomètre reste indicatif et la fermeture des réponses reste une action du professeur. Le parcours asynchrone continue de progresser individuellement.

Les listes nominatives ne sont pas transmises à la projection ni aux étudiants.

## Installation et validation

Ces changements n’ajoutent ni migration, ni dépendance, ni variable d’environnement. Les migrations de séances 005 et 006 restent les prérequis déjà documentés.

Les tests PostgreSQL couvrent le récapitulatif sans création, les droits d’accès, les maxima personnalisés, l’ordre, les versions et le refus d’une confirmation périmée. Les tests navigateur couvrent la vérification, l’aperçu local étudiant et expert, le retour au formulaire, l’actualisation après conflit et les commandes regroupées. Le parcours réel sur PostgreSQL vérifie également la création depuis le récapitulatif et la poursuite des cas synchrones.
