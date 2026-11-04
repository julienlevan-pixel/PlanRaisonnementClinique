# Prendre les présences

La fonction utilise le même code ou QR que la séance et conserve la palette claire de l’application. Elle fonctionne pour les séances multi-cas, les collectes individuelles et les deux publics : étudiants ou panel expert.

## Pour le professeur

1. Ouvrir la séance ou la collecte et choisir **Prendre les présences**.
2. Activer la feuille. Pour les étudiants, le matricule peut être recueilli en plus du nom et du prénom. Ce choix reste modifiable avant la première ligne de la feuille.
3. Facultativement, ouvrir **Ajouter une liste de personnes attendues** et coller une personne par ligne. Lorsque le matricule est activé, le séparer du nom par un point-virgule. Les doublons sont ignorés ; les zéros initiaux sont conservés.
4. Suivre les déclarations et corriger un statut : **À confirmer**, **Présent·e**, **En retard**, **Absent·e** ou **Absence justifiée**. La recherche et le filtre facilitent le suivi d’un groupe. Une ligne attendue non liée à une participation peut être retirée.
5. Choisir **Terminer les confirmations** lorsque souhaité. Cette commande ne ferme pas le questionnaire. Une personne encore « À confirmer » n’est pas automatiquement marquée absente. Les absences sont renseignées par le professeur, à partir de sa liste attendue.
6. Télécharger **Exporter la feuille CSV**. L’export contient la liste complète, les statuts, les heures de confirmation et de correction, et la modalité. Les noms et matricules restent réservés aux personnes autorisées à gérer la séance.

Le professeur peut rouvrir les confirmations avant la fin de la séance. Une séance terminée reste consultable et la feuille peut être corrigée manuellement. Les statuts modifiés sont datés et enregistrent l’auteur de la correction. Une révision périmée est refusée : le statut récent est présenté avant une nouvelle correction.

## Pour les participants

Après avoir rejoint par le code ou QR habituel, le participant voit **Votre présence**. Il renseigne son nom et prénom, ainsi que son matricule si demandé, puis choisit **Confirmer ma présence**. Son pseudonyme de questionnaire reste conservé.

La confirmation est unique pour toute la séance : actualiser la page, reprendre son parcours ou changer de cas ne crée pas une seconde présence. Elle reste accessible pendant l’accueil, la réponse et la restitution. Une correction du professeur est présentée au participant et ne peut pas être annulée par une nouvelle déclaration.

En asynchrone, les libellés deviennent **Votre participation** et **Confirmer ma participation**. Il s’agit d’une participation déclarée, sans attestation de présence physique en classe. Dans tous les modes, le professeur peut vérifier les déclarations et corriger sa feuille.

## Trois informations indépendantes

- **A rejoint** : une participation existe dans la séance.
- **Présence ou participation enregistrée** : une déclaration ou un statut a été renseigné dans la feuille.
- **Réponse transmise** : une copie définitive existe pour le cas.

Ces trois nombres peuvent différer. La prise de présences ne bloque pas les réponses, ne change pas leur statut et n’accorde ou ne retire aucun point. Sans liste attendue, le système ne peut pas énumérer les personnes qui n’ont jamais rejoint ; la liste permet au professeur de renseigner ces absences.

## Installation Supabase

Après les migrations 001 à 006 déjà utilisées pour les séances, exécuter [UPGRADE_ATTENDANCE.sql](UPGRADE_ATTENDANCE.sql) dans Supabase SQL Editor. Le résultat attendu est `true` pour `feuilles_presences_installees` et `confirmations_installees`.

Ce script ajoute uniquement les tables privées de présences et leur historique d’installation. Il peut être relancé. Pour une installation gérée par la ligne de commande, `pnpm db:migrate` applique automatiquement `007_attendance.sql`.

Sans cette installation, le professeur reçoit une information de mise à jour dans la feuille et les parcours participants existants continuent de fonctionner. Aucune nouvelle variable d’environnement ni dépendance n’est nécessaire.

## Contrôles d’accès et validation

Les participants ne reçoivent que leur propre confirmation, jamais la liste attendue, les matricules ou les statuts d’autrui. Aucune identité de présence n’est ajoutée à la projection ou au corrigé collectif. Les droits de gestion sont revérifiés pour chaque accès, y compris sur tous les cas d’une séance partagée. Les rôles Supabase publics ne peuvent pas lire les tables privées.

Les confirmations utilisent l’identité participante reconnue par le serveur et l’heure de la base de données. Les répétitions et les déclarations simultanées sont sérialisées pour éviter les doublons. L’authentification précède l’acquisition du client transactionnel pour permettre l’arrivée simultanée d’un groupe. Les imports de liste sont validés intégralement et insérés en lot.

Les tests couvrent l’activation, les listes attendues, les confirmations répétées et concurrentes, les corrections et leurs révisions, la confidentialité, les révocations, les séances multi-cas asynchrones, la conservation du pointage, l’export CSV, l’affichage mobile et l’absence de migration. Le parcours navigateur sur PostgreSQL comprend également l’activation par le professeur et la confirmation d’un expert.
