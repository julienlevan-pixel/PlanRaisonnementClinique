# Organiser plusieurs PRC dans une séance

**Mes PRC** reste la bibliothèque de contenu et de corrigés. **Mes séances** sert à réunir des cas dans un ordre pédagogique, à les animer avec un seul code et à conserver le bilan de l’ensemble.

## Préparer

1. Ouvrir **Mes séances → Nouvelle séance**, puis nommer la séance.
2. Choisir le public : **Étudiants** ou **Cliniciens experts**. Le parcours multi-cas est synchrone ; les accès asynchrones par PRC restent disponibles et autorisés par le professeur.
3. Sélectionner de 1 à 20 PRC distincts et ajuster leur ordre avec les flèches. Les cas doivent être complets. Pour une séance étudiante, chaque version doit déjà disposer d’un corrigé validé.
4. Cliquer sur **Créer la séance**. Les versions cliniques et les barèmes sont fixés à cet instant pour tous les cas. Une modification ultérieure du PRC ou du barème ne réécrit pas cette séance.

Seuls les cas sur lesquels le professeur a le droit de gérer les séances sont proposés. Une séance possède un responsable ; le partage d’un PRC n’accorde pas l’accès aux noms et réponses des autres cas de la séance. Le responsable doit conserver les droits de gestion sur tous les cas pour accéder au pilotage et au suivi nominatif.

## Animer

- Ouvrir **la projection de la séance** sur l’écran collectif. Son QR code et son code commençant par `S-` restent valables pour tous les cas.
- Les participants indiquent une seule fois leur nom ou pseudonyme. Un identifiant technique aléatoire, distinct du pseudonyme, permet la reprise dans le même navigateur : deux personnes portant le même nom ne partagent jamais une copie. Une interruption après l’inscription ne crée pas de deuxième participation lors d’une reprise avec la même clé.
- Pour le cas actif, utiliser **Présenter le cas**, puis **Ouvrir les réponses**. Un chronomètre indicatif est facultatif. Les étapes sont enregistrées et le cas reste visible sur la projection pendant les réponses.
- Le responsable voit le nombre de participants ayant rejoint, les soumissions et un suivi nominatif privé. Ces effectifs ne prétendent pas mesurer une présence réseau instantanée.
- Fermer les réponses et animer la discussion. Pour les étudiants, afficher la comparaison, les corrigés puis **Publier les résultats**. La publication du cas est nécessaire avant le passage au suivant. Si aucune copie n’a été soumise et que le cas est fermé, **Passer sans noter ce cas** permet de poursuivre : après confirmation, le cas entier est exclu de la note globale et de son maximum, sans attribuer de zéros. Un cas comportant une soumission ne peut pas être exclu ainsi. Pour les experts, fermer la collecte avant de poursuivre ; chacun garde la comparaison automatique du panel après sa soumission.
- Cliquer sur **Passer au cas suivant**. Les participants passent automatiquement au nouveau cas après quelques secondes, sans nouveau code ni nouvelle identification. Une double commande ne saute pas un cas. Les anciennes sauvegardes ne peuvent pas écraser la copie du nouveau cas.
- Après le dernier cas, cliquer sur **Terminer et afficher le bilan**. Une salle de projection ouverte suit la progression et affiche le bilan final. Les résultats de chaque cas sont conservés.

Pendant la correction, **Revoir le cas clinique** permet de revenir au scénario et aux données sans rouvrir les réponses. Après une séance experte, les liens vers chaque panel permettent de générer et valider ses corrigés avant de préparer une séance étudiante.

## Lire le bilan

Le maximum de la séance est la **somme des maxima des barèmes des cas évalués**, avec arrondi à deux décimales. Les maxima peuvent être différents selon les cas.

L’étudiant retrouve son score par cas et, s’il a une note pour chaque cas évalué, son résultat global sur le maximum de la séance. Le graphique collectif reste anonyme. Le responsable peut consulter séparément les résultats individuels ; aucune identité n’est envoyée à la projection.

Un cas non soumis reste sans note. Un participant absent d’une partie de la séance voit un bilan partiel sur les cas effectivement notés, et pas une note globale artificiellement pénalisée par des zéros. Les participations partielles sont exclues de la distribution des notes globales et leur nombre est indiqué. Les cas explicitement non évalués pour tout le groupe sont identifiés séparément. Si aucun cas n’a été évalué, aucune note globale ni distribution n’est produite. Un vrai score de zéro sur une copie soumise reste bien inclus.

Les cliniciens experts voient un récapitulatif de leurs contributions, sans note étudiante. Les séances terminées peuvent être archivées. La case **Afficher les séances archivées** permet de retrouver leur bilan ; **Restaurer la séance** la remet dans la liste courante sans rouvrir ses réponses. Les PRC utilisés dans une séance sont conservés pour protéger cet historique : pour les retirer de la bibliothèque courante, les archiver plutôt que les supprimer définitivement.

## Installer sur une base Supabase existante

Exécuter **`docs/UPGRADE_TEACHING_SESSIONS.sql`** dans SQL Editor, sur le projet PRC, après les migrations 001 à 004. Le script crée les tables privées de séances, les relations entre cas et les identités participantes ; il adapte le contrôle d’accès sans donner de droit aux rôles publics Supabase. Il ne remplace aucun compte, cas, corrigé ou réponse. Il peut être exécuté à nouveau.

Vérification :

```sql
SELECT
  to_regclass('prc_private.teaching_sessions') IS NOT NULL AS seances,
  to_regclass('prc_private.teaching_members') IS NOT NULL AS participants,
  EXISTS(SELECT 1 FROM prc_private.schema_migrations WHERE filename='005_teaching_sessions.sql') AS migration;
```

Les trois valeurs doivent être `true`. Fusionner ensuite la branche et laisser Netlify déployer. Aucune nouvelle variable d’environnement n’est nécessaire. Les anciennes activités et leurs codes restent utilisables ; les nouvelles séances sont créées depuis **Mes séances**.
