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

## Netlify

Le `netlify.toml` publie le build Vite et route `/api/*` vers la fonction `api`. Configurez dans Netlify `DATABASE_URL`, `SESSION_SECRET`, `APP_BASE_URL`, `ADMIN_INITIAL_USERNAME` et `ADMIN_INITIAL_PASSWORD`. La fonction crée son pool PostgreSQL côté serveur. Exécutez les migrations et l’initialisation de l’administrateur une seule fois pour chaque base, depuis un environnement de confiance.

La compilation Netlify lance aussi `pnpm --filter @workspace/api-server run build:netlify`. Cette étape regroupe la fonction et les sources TypeScript des bibliothèques partagées dans `artifacts/prc-pharmacie/dist/functions/api.mjs`, avant la création de l’archive Netlify. Le dossier de fonctions à déployer est donc `artifacts/prc-pharmacie/dist/functions`, et non le dossier des sources TypeScript.
