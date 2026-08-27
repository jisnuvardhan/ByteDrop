import type { Express } from "express";
import { z } from "zod";
import { calculateFootprint } from "./domain/calculation";
import { clearUsage, recordUsage, listUsage } from "./domain/localDb";
import { usageEventSchema } from "./providers";
import { applySecurityHeaders, consumeRateLimit, privacySafeError, getAllowedCorsOrigins, isTrustedOrigin, hasSafeJsonDepth } from "./security";

export function registerLocalApi(app: Express) {
  app.use("/api/local", (req, res, next) => {
    applySecurityHeaders(res);
    const allowedOrigins = getAllowedCorsOrigins();
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    if (!isTrustedOrigin(origin, allowedOrigins)) return res.status(403).json(privacySafeError());
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    if (!consumeRateLimit(`${req.ip ?? "local"}:${req.path}`, 120)) return res.status(429).json(privacySafeError());
    res.on("finish", () => console.info(`[local-api] ${req.method} ${req.path} ${res.statusCode}`));
    next();
  });

  app.get("/api/local/usage", async (req, res) => {
    try {
      const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(100), offset: z.coerce.number().int().min(0).max(10_000).default(0) }).strict().parse(req.query);
      return res.json(await listUsage(query.limit, query.offset));
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Usage query is invalid." });
      return res.status(503).json(privacySafeError());
    }
  });

  app.delete("/api/local/usage", async (_req, res) => {
    try {
      await clearUsage();
      return res.status(204).send();
    } catch {
      return res.status(503).json(privacySafeError());
    }
  });

  app.post("/api/local/usage", async (req, res) => {
    try {
      if (!hasSafeJsonDepth(req.body)) return res.status(413).json({ error: "Request is too large." });
      const input = usageEventSchema.parse(req.body);
      const footprint = calculateFootprint(input);
      const created = await recordUsage(input, footprint);
      return res.status(201).type("application/json").send(JSON.stringify(created));
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Usage record is invalid." });
      return res.status(503).json(privacySafeError());
    }
  });
}
