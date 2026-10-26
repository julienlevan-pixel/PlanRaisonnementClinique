# Passage de relais — PRC Pharmacie

## État et périmètre

Le dépôt Replit a été repris, sans réécriture de l'authentification ni remplacement de la base existante. Les corrections précédentes ont établi une connexion réelle utilisateur sur Netlify/Supabase et corrigé l'adaptateur Netlify, son archive autonome et le remontage des formulaires. Cette branche consolide ensuite le circuit pédagogique et l'UX du Prompt 2.

Les données réelles et les secrets ne sont pas transportés par Git. Aucun transfert de l'ancienne base Replit, aucune nouvelle migration distante et aucune charge sur la production n'ont été exécutés pendant cette consolidation. La tentative de contrôle SQL en lecture seule depuis Codex a échoué à la résolution réseau (`EAI_AGAIN`) ; elle ne prouve ni un mauvais mot de passe, ni une base défectueuse. La connexion utilisateur déjà confirmée reste une preuve distincte du contrôle de cette branche.

## Architecture réelle

- `artifacts/prc-pharmacie/src/App.tsx` : routes stables React/Wouter. Les fonctions de page restent stables pendant les mutations, afin de préserver champs, messages et callbacks.
- `src/app/` : actions, client API, cache React Query, composants communs et utilitaires.
- `src/features/` : bibliothèque/édition et prévisualisation, accès/administration, activité/projection et parcours participant/résultats.
- `lib/prc-backend/src/handler.ts` : routes HTTP et règles d'accès ; PostgreSQL paramétré via `@workspace/db`.
- `security.ts` : scrypt, empreintes de jetons, cookies opaques, sessions SQL et limitation persistée des connexions.
- `scoring.ts` : barème V2 2+8+2+8 pondéré par les points experts (1 à 3 par donnée). Le plafond de justification est calculé sur les cinq plus grands maxima directionnels de points ; aucune normalisation par le nombre de choix étudiant. Les anciennes distributions sans points utilisent les effectifs V1 ; les références validées restent immuables.
- `demo-case.ts`, `demo-responses.ts`, `demo.ts` : cas Toux fictif de 20 observations, dix experts, quatre copies étudiantes soumises et une copie non soumise. Référence et scores passent par les moteurs ordinaires.
- `deployment.ts` : refuse une configuration SQL absente et une preview qui n'a pas explicitement déclaré sa base de test.
- `artifacts/prc-pharmacie/netlify/functions/api.ts` : adaptateur Request/Response actuel.
- `artifacts/api-server/build-netlify.mjs` : archive JS autonome produite avant le traçage Netlify. Le serveur Express local réutilise les mêmes services métier ; il n'est pas un service indispensable à la production.

## Schéma et conservation de l'historique

Tous les objets applicatifs sont dans `prc_private`. Les tables principales sont `users`, `sessions`, `login_attempts`, `prcs`, `prc_versions`, `launches`, `invitations`, `participants`, `responses`, `references`, `schema_migrations` et `demo_installations`.

- `001_initial.sql` crée la base privée et révoque l'accès public.
- `002_workflow.sql` est additive : archivage, marquage démo/essai, agrégat figé à la fermeture, révision optimiste et empreinte de clé de reprise de participation.
- `003_demo.sql` conserve l'installation fictive par propriétaire, sa progression et son bail temporaire ; les requêtes de préparation sont bornées et reprenables.

Les versions et snapshots figent les cas et corrigés. Les modifications cliniques ne réécrivent pas les anciennes copies. Une campagne d'essai ne peut pas produire une référence réelle. L'archivage conserve les relations et résultats ; une duplication crée une copie appartenant à l'enseignant courant.

Le runner de migrations sérialise les opérations avec un verrou PostgreSQL, applique chaque migration et son historique dans la même transaction et n'est jamais appelé depuis un build ou une requête participante.

## Authentification et autorisations

Aucune inscription publique ni adresse courriel obligatoire. L'administrateur initial est créé par une commande privée idempotente ; les enseignants sont créés, réinitialisés et activés/désactivés par l'administration. La réinitialisation ou désactivation invalide les sessions. L'initialisation ne remplace jamais le mot de passe d'un administrateur existant.

Les sessions enseignantes et participantes emploient des cookies distincts, permettant l'essai d'un questionnaire sans perdre la connexion enseignante. Le rôle est déterminé par la base et le lancement, jamais par un champ envoyé par le navigateur. Le pseudonyme n'est pas une preuve d'accès ; une clé de reprise aléatoire ou une invitation individuelle est nécessaire pour retrouver la même participation.

Les mutations contrôlent l'origine ; les cookies sont HttpOnly, SameSite et Secure en production. Les jetons et clés de reprise sont enregistrés sous forme d'empreintes. Les schémas exposés de la Data API Supabase doivent toujours être contrôlés dans les paramètres du projet ; des droits SQL privés ne remplacent pas cette vérification opérateur.

## Routes principales

| Route | Usage |
| --- | --- |
| `/api/auth/*` | Connexion, compte courant, changement de mot de passe, déconnexion. |
| `/api/teachers` et `/:id` | Administration fermée des comptes. |
| `/api/prcs` et `/:id` | Bibliothèque avec recherche/archivage et versions. |
| `/api/prcs/:id/duplicate`, `/:id/trial`, `/:id/launches` | Copie, essai isolé, lancement réel. |
| `/api/launches/:id/invitations`, `/join/:code`, `/launches/:id/join` | Accès, invitation et reprise idempotente. |
| `/api/participant/response`, `/state`, `/submit`, `/results` | Brouillon révisionné, état léger, soumission et correction privée. |
| `/api/launches/:id/close`, `/reveal`, `/publish` | Animation persistée, distincte de la publication des notes. |
| `/api/launches/:id/panel-results`, `/results`, `/projection` | Agrégats bornés au lancement ; projection sans identité ni score individuel. |
| `/api/demo-case`, `/api/demo` | Exemple public fictif et initialisation isolée par enseignant. |

Les réponses ne sont pas notées avant leur soumission. Une copie non soumise reste sans note, même après publication. Une répétition de soumission est idempotente ; une modification d'une copie définitive reste interdite. Un envoi de brouillon périmé renvoie 409 ; la répétition exacte après perte d'accusé ne crée pas de nouvelle version.

## Exécution et déploiement

Node 24, pnpm 10.28.2 ; `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`. Les commandes et variables de production, prévisualisation, migrations, sauvegarde et retour arrière sont détaillées dans `DEPLOY_NETLIFY_SUPABASE.md`.

Le build Netlify compile Vite puis la fonction autonome. Le dossier de fonctions déployées est `artifacts/prc-pharmacie/dist/functions`, le dossier public `artifacts/prc-pharmacie/dist/public`. Les URLs `/api/*` passent avant le fallback de navigation. Aucun secret n'a de préfixe `VITE_`.

La production et les previews doivent avoir des bases, secrets et URLs distincts. `PRC_DATABASE_ENV=test` est nécessaire pour une preview ; ce marqueur est une déclaration de configuration explicite, pas une preuve technique que la base choisie est vide ou sans données réelles.

## Validation exécutée et preuves

Les tests SQL utilisent uniquement des bases locales uniques, créées et supprimées par `scripts/run-local-checks.mjs`. Ils ne retombent jamais sur les variables Supabase injectées.

Le parcours intégré vérifie sur PostgreSQL : administration/obligation de changement initial, propriété des cas, absence de droits SQL publics, invitations et reprise experte, absence de référence pendant la collecte, minorités et seuil, brouillons et révisions avec perte d'accusé, révélation avant notes, copie non soumise sans zéro, projection sans identités, soumission concurrente avec fermeture, essais isolés, historique, réinitialisation/désactivation et démonstration Toux idempotente entre propriétaires. Les ajouts sont validés sur une nouvelle base pour chaque exécution, y compris l'ajout d'une clé de reprise de groupe.

Des défauts ont été découverts et corrigés pendant cette validation : comparaison de brouillons sensible à l'ordre des clés JSONB ; attente d'une nouvelle connexion de pool alors que les deux clients étaient retenus par des transactions. Les contrôles de reprise et de charge couvrent ces cas.

Les tests navigateur ciblés vérifient les écrans, la conservation de saisie, les erreurs et les étapes de restitution avec des réponses contrôlées. Un parcours navigateur distinct avec vraie base est déclenché uniquement par le runner `browser` : il utilise des comptes synthétiques, des contextes de navigateur séparés et la fonction Netlify compilée servie localement. Les résultats finaux doivent être distingués des tests à API simulée.

### Mesure de charge locale

Le rapport exact sans secrets est conservé dans `docs/validation/local-load-results.json`. Sa cible est une base PostgreSQL locale jetable et le moteur HTTP Request/Response dans une seule instance ; les appels de reprise et doubles clics sont inclus. Environnement : Linux x64, Node 24.19.0, PostgreSQL 17.11, cinq threads CPU disponibles, petit pool plafonné à deux connexions.

La commande de reproduction de la campagne à 300 étudiants simultanés est :

```bash
PRC_PG_BIN=/chemin/vers/postgresql/bin \
PRC_TEST_HOST=/chemin/vers/socket-local PRC_TEST_PORT=55432 \
PRC_LOAD_USERS=300 PRC_LOAD_CONCURRENCY=300 \
node scripts/run-local-checks.mjs load
```

Ces mesures ne couvrent ni Internet/TLS, ni le pooler Supabase distant, ni les démarrages à froid ou multiples instances Netlify. Elles ne valident pas une capacité de production à 300 étudiants. Une campagne distante doit cibler un environnement de test explicitement autorisé.

## Limites opérationnelles à garder visibles

- Les migrations de cette branche et ses nouveaux écrans ne sont pas présumés déployés en production.
- Les données d'une ancienne base Replit n'ont pas été découvertes ou transférées ; ne pas affirmer leur conservation distante sans inventaire/sauvegarde.
- La démonstration est explicitement fictive et pédagogique ; ses choix/scores ne constituent pas une validation clinique.
- Un accès Netlify protégé par une connexion Netlify peut empêcher des participants externes d'atteindre l'application, indépendamment des droits PRC.
- Le compte initial, les mots de passe et les réponses réels n'ont pas été réinitialisés par ces tests.
