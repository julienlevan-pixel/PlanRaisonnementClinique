export function dateLabel(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
export function getError(error: unknown) {
  const data =
    error && typeof error === "object" && "data" in error
      ? (error as { data?: { error?: unknown } }).data
      : null;
  if (typeof data?.error === "string") return data.error;
  if (error instanceof TypeError && /fetch|network/i.test(error.message))
    return "Connexion interrompue. Vérifiez votre accès réseau puis réessayez.";
  if (error instanceof Error)
    return error.message || "Une erreur est survenue. Veuillez réessayer.";
  return "Une erreur est survenue. Veuillez réessayer.";
}
