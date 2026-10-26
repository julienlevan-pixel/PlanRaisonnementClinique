# PRC Pharmacie

Application en français pour préparer un plan de raisonnement clinique, recueillir les réponses d’un panel, figer un corrigé et animer des groupes d’étudiants.

## Développement

- `pnpm install`
- `pnpm --filter @workspace/prc-backend run migrate` — applique les migrations versionnées à la base Supabase de développement.
- `pnpm --filter @workspace/prc-backend run init-admin` — crée l’administrateur initial sans modifier un compte existant.
- `pnpm --filter @workspace/prc-pharmacie run dev` — interface Vite (API locale via l’API server Replit).
- `pnpm run typecheck`
- `pnpm --filter @workspace/prc-backend run test`

Configurez les variables serveur décrites dans `.env.example` dans Replit Secrets. Utilisez l’URL du pooler Supabase en mode transaction. Ne préfixez aucun secret par `VITE_`.

Les tests navigateur de connexion utilisent une API simulée et ne nécessitent aucun secret : installez Chromium avec `pnpm --filter @workspace/prc-pharmacie exec playwright install chromium`, puis lancez `pnpm --filter @workspace/prc-pharmacie run test:e2e`. Un Chromium déjà installé peut être sélectionné avec `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## Netlify

Le `netlify.toml` publie le build Vite et route `/api/*` vers la fonction `api`. Configurez dans Netlify `DATABASE_URL`, `SESSION_SECRET`, `APP_BASE_URL`, `ADMIN_INITIAL_USERNAME` et `ADMIN_INITIAL_PASSWORD`. La fonction crée son pool PostgreSQL côté serveur. Exécutez les migrations et l’initialisation de l’administrateur une seule fois pour chaque base, depuis un environnement de confiance.

La compilation Netlify lance aussi `pnpm --filter @workspace/api-server run build:netlify`. Cette étape regroupe la fonction et les sources TypeScript des bibliothèques partagées dans `artifacts/prc-pharmacie/dist/functions/api.mjs`, avant la création de l’archive Netlify. Le dossier de fonctions à déployer est donc `artifacts/prc-pharmacie/dist/functions`, et non le dossier des sources TypeScript.

## Préparer et partager des cas

**Vue d’ensemble** suit les séances et les participations. **Mes PRC** donne accès à la bibliothèque, à la recherche et aux cas partagés. Dans un cas enregistré, **Partager** permet à son propriétaire d’ajouter un autre compte enseignant PRC pour modifier le même document. La gestion des séances peut être accordée séparément ; le propriétaire conserve le contrôle du partage et de l’archivage.

La fonctionnalité de collaboration exige la migration `004_collaboration.sql` avant le déploiement. Pour une base existante, le script réexécutable [docs/UPGRADE_SHARED_PRCS.sql](docs/UPGRADE_SHARED_PRCS.sql) prépare cette mise à jour sans remplacer les données existantes.

Dans **Mes PRC → Autres actions**, le propriétaire peut aussi **Supprimer définitivement** un PRC, en préparation, en cours, terminé ou archivé. La confirmation précise que les versions, séances, invitations, réponses, corrigés et accès partagés seront supprimés ; les codes d’accès deviennent inutilisables. Les autres PRC et les comptes enseignants restent conservés. Pour conserver les résultats, utiliser **Archiver**. Cette suppression ne nécessite aucune migration supplémentaire.
