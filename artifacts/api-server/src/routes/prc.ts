import { Router, type IRouter } from "express";
import { handleApiRequest } from "@workspace/prc-backend";

const router: IRouter = Router();

router.use(async (req, res): Promise<void> => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (name === "host" || name === "content-length" || value == null) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const origin = `${req.protocol}://${req.get("host") ?? "localhost"}`;
  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : req.body == null
        ? undefined
        : JSON.stringify(req.body);
  const request = new Request(new URL(req.originalUrl, origin), {
    method: req.method,
    headers,
    body,
  });
  const response = await handleApiRequest(request);
  res.status(response.status);
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.send(await response.text());
});

export default router;
