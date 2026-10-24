import { handleApiRequest } from "@workspace/prc-backend";

interface NetlifyEvent {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
  queryStringParameters?: Record<string, string | undefined> | null;
}

export default async function handler(event: NetlifyEvent) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(event.headers ?? {})) {
    if (value != null) headers.set(name, value);
  }
  const rawPath = event.queryStringParameters?.path ?? "";
  const path = rawPath ? `/api/${rawPath.replace(/^\/+/, "")}` : "/api";
  const host = headers.get("host") ?? headers.get("x-forwarded-host") ?? "localhost";
  const protocol = headers.get("x-forwarded-proto") ?? "https";
  const body =
    event.body && event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : event.body || undefined;
  const request = new Request(`${protocol}://${host}${path}`, {
    method: event.httpMethod ?? "GET",
    headers,
    body:
      typeof body === "string"
        ? body
        : body instanceof Buffer
          ? body
          : undefined,
  });
  const response = await handleApiRequest(request);
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  };
}
