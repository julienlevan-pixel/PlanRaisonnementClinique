/** Preview deploys must explicitly use a separately configured test database. */
export function deploymentDatabaseError(): string | null {
  if (
    !process.env.SUPABASE_DATABASE_URL?.trim() &&
    !process.env.DATABASE_URL?.trim()
  ) {
    return "La connexion PostgreSQL n’est pas configurée. Renseignez DATABASE_URL côté serveur.";
  }
  const context = process.env.PRC_DEPLOY_CONTEXT;
  if (
    (context === "deploy-preview" || context === "branch-deploy") &&
    process.env.PRC_DATABASE_ENV !== "test"
  ) {
    return "Cette prévisualisation nécessite une base de test distincte et PRC_DATABASE_ENV=test. Configurez les variables du contexte Netlify avant de l’utiliser.";
  }
  return null;
}
