# Déployer PRC Pharmacie sur Netlify et Supabase

## Ce qui existe et ce qui reste manuel

L'application React/Vite et les fonctions Netlify partagent une seule logique métier TypeScript. PostgreSQL est la source de vérité ; les tables de `prc_private` ne sont pas lues directement par le navigateur. Les cookies opaques sont contrôlés par l'API, sans Supabase Auth ni inscription publique.

Le domaine de production utilisé pendant la préparation est `https://planderaisonnementclinique.netlify.app`. L'utilisateur a confirmé une connexion réussie à cette production avant les changements de consolidation. Cela ne valide pas cette nouvelle branche : ses tests et migrations sont exécutés séparément, sur une base locale jetable. Fusionner une branche, publier Netlify ou enregistrer un brouillon Codex sont trois opérations distinctes.

Les étapes nécessitant vos accès restent manuelles : configuration des secrets et contextes Netlify, sauvegarde de la base Supabase réelle, application des nouvelles migrations approuvées sur cette base, fusion de la pull request et validation du déploiement. Aucun secret n'est à copier dans Git ou dans une conversation.

## 1. Préparer les bases et la sauvegarde

Utiliser un projet Supabase de développement/test distinct de la production. Ne pas créer un nouveau projet à la place d'une base déjà utilisée : identifier d'abord les données et leur propriétaire. Un dépôt Git ne contient ni les données SQL, ni les secrets Netlify/Replit.

Avant une modification de schéma réelle, effectuer une sauvegarde privée hors dépôt avec un compte de sauvegarde approprié :

```bash
pg_dump --format=custom --no-owner --no-acl --file=/chemin/prive/prc-avant-migration.dump "$BACKUP_DATABASE_URL"
```

`BACKUP_DATABASE_URL` doit désigner la connexion adaptée à la sauvegarde (connexion directe ou pooler de session), et pas nécessairement le pooler transactionnel utilisé à l'exécution. Conserver la sauvegarde dans un emplacement privé et tester sa restauration dans une base séparée. Ne jamais effacer la source pour résoudre un problème de transfert.

Si une ancienne base Replit contient encore des données utiles, comparer avant transfert les comptes, propriétaires, PRC/versions, lancements, invitations, participants, copies et références. Préserver UUID, liens et hachages existants. Restaurer la sauvegarde dans une base d'essai, comparer les totaux, vérifier clés étrangères et scores, puis prévoir une fenêtre de bascule et un retour vers la source. Le changement de domaine peut nécessiter de se reconnecter ; il ne doit pas réinitialiser un compte.

## 2. Configurer les variables serveur

Configurer les valeurs dans l'interface sécurisée Netlify, au scope **Functions** pour les variables d'exécution. Une variable de build portant le préfixe `VITE_` est publique : ne jamais y mettre un secret.

| Variable | Utilisation |
| --- | --- |
| `DATABASE_URL` | Connexion PostgreSQL du projet correspondant au contexte, via le transaction pooler, généralement port 6543. Activer TLS avec vérification (`sslmode=verify-full`). |
| `SESSION_SECRET` | Valeur aléatoire forte, propre au contexte ; conservée côté serveur pour la limitation persistée des connexions. |
| `APP_BASE_URL` | URL HTTPS de ce déploiement, sans `/` final, utilisée dans les liens et QR individuels. |
| `MIGRATION_DATABASE_URL` | Connexion dédiée aux migrations, dans le shell de confiance qui applique le schéma ; pas requise dans une fonction. |
| `ADMIN_INITIAL_USERNAME`, `ADMIN_INITIAL_PASSWORD` | Uniquement pour l'initialisation privée. Ne sont pas nécessaires à chaque démarrage Netlify si le compte existe déjà. |
| `PRC_DATABASE_ENV=test` | Requis pour les fonctions de preview/branch-deploy, uniquement avec une base de test explicitement isolée. |

`SUPABASE_DATABASE_URL` est un ancien alias prioritaire accepté par le code ; éviter de définir simultanément cet alias et `DATABASE_URL` avec deux bases différentes. Les caractères réservés du mot de passe doivent être encodés dans l'URI. Ne jamais désactiver la vérification TLS pour contourner une erreur de certificat ; utiliser une chaîne de confiance adaptée.

Si Supabase exige son autorité de certification, télécharger le certificat public depuis la section SSL des paramètres Database du projet. Dans Netlify, renseigner `DATABASE_SSL_ROOT_CERT` avec **tout le texte PEM**, de `-----BEGIN CERTIFICATE-----` à `-----END CERTIFICATE-----`, au scope Functions et dans le bon contexte. Le code accepte aussi un chemin de fichier pour les scripts locaux. Ne pas saisir seulement le nom du fichier dans Netlify. Les retours à la ligne réels ou échappés `\n` sont acceptés. Redéployer après enregistrement. Aucun certificat n’est téléchargé depuis une connexion non vérifiée et aucun secret n’est incorporé dans le build Vite.

Les connexions d'exécution utilisent un petit pool par instance et des requêtes paramétrées sans prepared statements nommés. Le pool limite les connexions de chaque instance, pas le nombre total de connexions de toutes les fonctions Netlify : la capacité réelle doit être mesurée sur l'environnement cible.

## 3. Appliquer explicitement les migrations

Prérequis : Node 24 et pnpm 10.28.2. Utiliser le checkout existant : chaque tâche cloud est déjà isolée ; ne pas créer de worktree sans demande explicite.

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
```

Exécuter cette commande dans un shell de confiance où `MIGRATION_DATABASE_URL` désigne **la base choisie volontairement**. Le script conserve l'historique, sérialise les migrations et les applique en transactions. Les migrations ne tournent pas pendant le build ni à chaque requête HTTP. La migration initiale retire les droits publics ; les migrations suivantes sont additives et préservent les données existantes.

Pour une nouvelle base seulement, créer l'administrateur :

```bash
pnpm admin:init
```

Configurer au préalable les deux variables d'initialisation privées. La commande ne réinitialise pas un administrateur existant et ne transforme pas un enseignant en administrateur. Les mots de passe sont hachés avec scrypt ; le mot de passe initial doit être changé dans l'application. Modifier la variable d'initialisation après création ne modifie pas le mot de passe stocké.

Vérifier que `prc_private` ne figure pas parmi les schémas exposés dans les paramètres de la Data API Supabase. Les rôles `anon` et `authenticated` ne doivent avoir aucun droit d'usage sur ce schéma, ni de lecture sur ses tables. Les sessions applicatives ne s'appuient pas sur `auth.uid()`.

## 4. Associer GitHub à Netlify

Importer le dépôt GitHub et choisir la branche de production `main`. Le fichier `netlify.toml` versionné est la référence : base à la racine, interface publiée depuis `artifacts/prc-pharmacie/dist/public`, fonctions générées dans `artifacts/prc-pharmacie/dist/functions`.

Le build comprend Vite puis `pnpm --filter @workspace/api-server run build:netlify`. Cette seconde étape regroupe les sources TypeScript partagées dans une fonction autonome `api.mjs`. Ne pas pointer les fonctions déployées vers le répertoire de sources : le traçage de dépendances Netlify v2 peut omettre les sources des packages workspace.

Les versions Node/pnpm et les valeurs de build `PORT=5173`, `BASE_PATH=/` sont épinglées dans la configuration. Ces deux dernières variables satisfont la configuration Vite pendant la compilation ; elles ne démarrent pas un serveur permanent en production.

Les routes `/api` et `/api/*` doivent atteindre la fonction avant le fallback `/index.html`. L'adaptateur utilise le format Netlify actuel `Request` → `Response` et conserve méthode, corps, origine, en-têtes et cookies.

## 5. Séparer production et previews

Définir les secrets par **deploy context**. La production utilise sa base réelle. Les contextes `deploy-preview` et `branch-deploy` doivent utiliser une base Supabase de test et leur propre secret de session, avec `PRC_DATABASE_ENV=test`. Sans ce marquage, l'API de preview répond 503 : c'est un blocage volontaire contre une utilisation implicite de données réelles.

`APP_BASE_URL` doit être l'adresse effective du contexte, sinon les invitations et QR renvoient vers une autre version. Ne pas utiliser « same value for all deploy contexts » pour les secrets de base ou l'URL lorsque de vraies previews sont activées. Le bundle conserve uniquement le nom non secret du contexte ; aucun secret n'est injecté dans le JavaScript public.

Une protection d'accès Netlify (« Log in with Netlify ») est distincte de l'authentification PRC. Si elle reste activée, des experts/étudiants sans compte Netlify ne pourront pas atteindre l'application. Choisir explicitement les règles d'accès de la production et des previews selon le public prévu ; les comptes PRC et les autorisations serveur restent nécessaires.

### Accès des experts sans compte

Dans le tableau de bord du projet Netlify, ouvrir **Project configuration → Access & security → Visitor access**. Dans **Password Protection**, désactiver la protection exigeant une connexion Netlify pour le site de **production** (selon l’interface : « No protection » ou protection limitée aux déploiements hors production). Enregistrer. Ce réglage d’hébergement ne se modifie pas dans `netlify.toml` et exige un accès au compte Netlify.

Vérifier en navigation privée que l’accueil et un lien `/join/CODE` s’ouvrent sans écran Netlify. Le professeur continue à utiliser sa connexion PRC pour créer, fermer ou consulter une séance. Ne pas communiquer son compte aux experts.

Pour un panel en séance : ouvrir l’activité, afficher le QR commun ou copier son lien. L’expert scanne le QR ou saisit le code sur l’accueil, indique son nom ou pseudonyme et rejoint directement le cas. Le code de séance est vérifié côté serveur ; les nouvelles participations sont refusées après fermeture. Une nouvelle tentative dans le même navigateur reprend la même participation, sans utiliser le nom comme preuve d’identité. Les invitations individuelles restent disponibles pour retrouver une copie depuis un autre navigateur.

L’expert retient deux hypothèses distinctes, cinq données signées par hypothèse, et attribue **1 à 3 points à chacune** (1 peu discriminante, 2 modérément, 3 très discriminante). Toutes les valeurs sont contrôlées côté serveur. Les brouillons peuvent être incomplets ; la soumission définitive exige les dix pondérations. Les étudiants ne pondèrent pas leurs choix.

Après soumission, un tableau par diagnostic présente toutes les données, les choix/points de l’expert et les effectifs/points anonymes cumulés du panel, **lui compris**. Les choix principaux et alternatifs sont réunis pour cette comparaison, avec les directions + et − séparées. Les brouillons et les identités des autres experts ne sont jamais exposés. Ces tableaux apparaissent automatiquement, y compris pendant une collecte asynchrone, et sont actualisés toutes les 15 secondes tant que la séance est ouverte et la page visible et connectée. Un expert non soumis n’accède pas à ces agrégats ; la projection et la restitution étudiante conservent leurs règles de révélation.

Les nouveaux corrigés V2 utilisent les **sommes de points directionnels** pour la justification : R additionne les points concordants ; C additionne les cinq meilleurs maxima directionnels, une valeur par donnée ; la justification vaut 8 × R/C par rôle. Les deux diagnostics restent à 2 points chacun, pour une note totale sur 20. Les réponses historiques sans pondération valent un point par donnée. Les corrigés déjà validés, leurs plafonds et les notes enregistrées sont conservés. Les points sont stockés dans les choix JSON existants : aucune migration SQL.

Ce changement utilise les tables existantes et ne nécessite aucune migration SQL. Le réglage Netlify doit être effectué séparément de la fusion du code.

## 6. Contrôler le déploiement

Après `Published`, vérifier dans des sessions de navigateur distinctes :

1. `/api/healthz` renvoie un JSON, et une route `/api/...` inconnue renvoie un JSON 404, pas la page d'accueil.
2. L'accueil et un lien direct vers un PRC fonctionnent après actualisation.
3. Un mauvais mot de passe affiche une erreur ; le bon ouvre le tableau de bord ; le changement initial et la déconnexion fonctionnent.
4. Le cookie enseignant est HttpOnly, Secure en production et SameSite ; un participant ne reçoit aucun droit enseignant. Un essai enseignant conserve sa session enseignante.
5. Les liens et QR emploient le domaine attendu ; le panel accepte son code commun ou une invitation individuelle, sans compte Netlify. Après soumission uniquement, un expert voit les tableaux anonymes actualisés, même pendant la collecte. Un étudiant et un expert en brouillon n’y ont pas accès.
6. Panel → fermeture → référence validée → groupe étudiant → soumission → révélations → publication privée fonctionne. Une copie non soumise reste sans note.
7. La projection ne révèle ni identité ni score individuel ; les enseignants ne voient pas les PRC d'autrui.

En cas d'erreur, consulter les journaux de la fonction `api`. Ne pas recopier une URI SQL ou un mot de passe. Un contrôle de santé ne prouve pas à lui seul l'accès à la base ni la capacité d'une classe de 300 étudiants.

## 7. Exécuter les validations et la charge hors production

```bash
pnpm typecheck
pnpm test
pnpm --filter @workspace/prc-pharmacie run test:e2e
NODE_ENV=production PORT=5173 BASE_PATH=/ pnpm --filter @workspace/prc-pharmacie run build
pnpm --filter @workspace/api-server run build:netlify
```

Le runner PostgreSQL ci-dessous crée une base locale jetable, applique les migrations et la supprime à la fin. Il ignore volontairement les variables de base réelles. Il faut un cluster PostgreSQL local démarré et des outils `createdb`, `psql`, `dropdb` accessibles :

```bash
PRC_TEST_HOST=127.0.0.1 PRC_TEST_PORT=5432 node scripts/run-local-checks.mjs integration
PRC_TEST_HOST=127.0.0.1 PRC_TEST_PORT=5432 node scripts/run-local-checks.mjs load
```

`PRC_PG_BIN` peut désigner le répertoire des outils PostgreSQL ; `PRC_TEST_HOST` peut être un socket Unix privé. Le test de charge utilise par défaut 300 étudiants et 50 participants concurrents ; ajuster `PRC_LOAD_USERS` et `PRC_LOAD_CONCURRENCY` explicitement. Il simule arrivée, sauvegardes, lecture d'état, reprise après perte d'accusé, soumission et double clic ; il mesure latences, erreurs, requêtes SQL, connexions maximales, copies perdues, scores manquants et doublons. Le rapport sans secrets est écrit dans `.local/validation/load-results.json`.

Cette mesure locale utilise une seule instance du moteur HTTP Request/Response avec PostgreSQL réel. Elle ne mesure pas Internet, TLS, démarrages à froid, concurrence multi-instances Netlify ni le pooler Supabase distant : elle ne prouve pas une capacité de production à 300 étudiants. Une campagne distante doit viser une base et un site de test explicitement autorisés.

## 8. Retour arrière

Pour un défaut de code, republier le dernier déploiement Netlify connu et conserver la base. Les migrations additives n'exigent pas d'effacer les nouveaux champs pour revenir au code précédent. Ne pas automatiser un `DROP` pour annuler une version.

Pour une restauration de données, restaurer d'abord la sauvegarde dans une base distincte, vérifier comptes/totaux/relations et reconnecter un déploiement d'essai. Une bascule de production exige de tenir compte des nouvelles réponses collectées depuis la sauvegarde ; conserver l'original jusqu'à validation. Les hachages compatibles peuvent être préservés ; en cas d'incompatibilité, réinitialiser les mots de passe via l'administration tout en conservant comptes et contenus.

## Parcours étudiant : séance guidée ou travail asynchrone

Dans le PRC disposant d’un corrigé validé, choisir la **Modalité du groupe étudiant** avant de cliquer sur **Lancer avec les étudiants**. Chaque nouveau groupe est indépendant. Les deux parcours demandent deux hypothèses distinctes et exactement cinq données signées par hypothèse ; les étudiants n’attribuent aucun point.

- **Synchrone** : cliquer sur **Terminer le temps de réponse** pour fermer définitivement la collecte et figer les effectifs. Cliquer sur **Afficher la comparaison des hypothèses**, puis sur **Afficher le corrigé** pour chaque diagnostic. La liste commence par le diagnostic le plus retenu par les experts ; tous les choix du cas, y compris ceux à zéro expert, restent disponibles. Les étapes sont enregistrées sur le serveur et apparaissent sur la projection et les écrans étudiants. Chaque étudiant voit ses choix en face du corrigé et son sous-total sur 10 pour une hypothèse qu’il a choisie. Sinon, le message « Vous n’avez pas sélectionné cette réponse » apparaît. La note globale sur 20 reste masquée jusqu’à **Publier les résultats**.
- **Asynchrone** : chaque étudiant voit ses deux corrections et sa note privée immédiatement après sa soumission, même si le groupe reste ouvert. Aucune comparaison avec les autres étudiants n’est transmise. Les brouillons ne sont ni corrigés ni notés.

Les effectifs comparés utilisent les copies définitives uniquement. Pour chaque diagnostic, le pourcentage exprime la proportion des participants l’ayant retenu en principale **ou** en alternative ; la somme peut atteindre 200 %, puisque chaque participant choisit deux diagnostics distincts. La projection ne contient ni identité, ni réponse, ni note individuelle.

Pour ces nouveaux groupes, le barème réunit les contributions expertes principales et alternatives par diagnostic : diagnostic représenté = 2 points, données concordantes = 8 × R/C, où R additionne les points experts de même signe et C les cinq meilleurs maxima directionnels. Un diagnostic absent de **tout** le panel vaut 0/2 et 0/8. Les deux hypothèses de l’étudiant totalisent donc au maximum 20 points. Les anciens groupes et leurs notes ne sont pas recalculés.

Aucune migration SQL ni nouvelle variable Netlify : la modalité est figée dans les paramètres JSON du lancement, et les étapes dans son état de révélation existant. Les groupes historiques et les anciens clients API conservent leur fonctionnement antérieur ; le nouveau parcours est activé par `deliveryMode` lors de la création d’un groupe étudiant.

## Bibliothèque et collaboration entre professeurs

La navigation sépare maintenant **Vue d’ensemble** (`/`) — indicateurs, activités ouvertes et récentes — de **Mes PRC** (`/prcs`) — recherche, création, archives et cas partagés. Les activités affichées sont limitées aux cas et séances accessibles au professeur connecté.

Dans un PRC enregistré, le propriétaire ouvre **Partager**, saisit l’identifiant PRC d’un autre professeur et confirme **Partager ce PRC**. Le collègue doit disposer d’un compte enseignant actif créé dans l’administration PRC. Il retrouve le même cas dans **Mes PRC**, avec le même identifiant et les mêmes versions ; le partage ne crée aucune copie.

L’accès partagé permet d’éditer le contenu. La case **Autoriser aussi la gestion des panels, groupes et copies étudiantes** donne en plus accès aux séances du PRC ; elle est désactivée par défaut. Le propriétaire peut changer ce droit ou retirer l’accès. Les collaborateurs ne peuvent pas partager à d’autres comptes ni archiver le cas. Les séances qu’ils créent restent attachées au propriétaire du PRC : retirer un accès retire aussi les droits sur ces séances, sans supprimer leurs réponses.

Le formulaire envoie la version qu’il a effectivement chargée. Si un autre professeur enregistre entre-temps, une sauvegarde obsolète est refusée ; le travail local reste visible, avec une action pour charger la version récente. Le chargement demande confirmation si des modifications locales seraient remplacées. Ce mécanisme protège les enregistrements concurrents ; il ne fusionne pas automatiquement deux textes en cours de saisie. Les lancements et corrigés existants conservent leurs questionnaires figés.

**Migration requise avant de déployer cette fonctionnalité :** appliquer `docs/UPGRADE_SHARED_PRCS.sql` dans SQL Editor sur une base déjà installée, ou exécuter le migrateur privé qui inclut `004_collaboration.sql`. Le script est additif et réexécutable ; il ajoute la table des collaborateurs et les fonctions de contrôle d’accès, sans modifier les comptes, cas et réponses existants. Les fonctions et la table sont interdites aux rôles publics Supabase. Tester ensuite le partage et la révocation avec deux comptes PRC.

Si Netlify a suspendu les déploiements pour dépassement de quota, conserver les changements dans GitHub et préparer la migration ; attendre la reprise des déploiements pour publier la version. Aucun nouveau secret Netlify n’est requis.
