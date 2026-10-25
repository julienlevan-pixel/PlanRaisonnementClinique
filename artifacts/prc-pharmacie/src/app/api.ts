export async function api<T = any>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const text = await response.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    const message = text.includes("edge-access")
      ? "La protection d’accès Netlify empêche d’atteindre l’application. Vérifiez les réglages d’accès du site."
      : "Le serveur a renvoyé une réponse inattendue. Réessayez.";
    throw Object.assign(new Error(message), {
      status: response.status,
      data: { error: message },
    });
  }
  if (!response.ok)
    throw Object.assign(new Error(body.error || "La requête a échoué."), {
      status: response.status,
      data: body,
    });
  return body as T;
}
