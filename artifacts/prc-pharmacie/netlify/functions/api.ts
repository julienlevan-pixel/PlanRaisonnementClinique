import { handleApiRequest } from "@workspace/prc-backend";

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const redirectedPath = url.searchParams.get("path");
  if (redirectedPath !== null) {
    url.pathname = `/api/${redirectedPath.replace(/^\/+/, "")}`;
    url.searchParams.delete("path");
  } else if (url.pathname === "/.netlify/functions/api") {
    url.pathname = "/api";
  }
  return handleApiRequest(new Request(url, request));
}
