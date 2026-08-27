import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { applySecurityHeaders, isTrustedOrigin, consumeRateLimit, privacySafeError, securityHeaders, hasSafeJsonDepth, cleanupRateLimitBuckets, clearRateLimitBucketsForTests, getAllowedCorsOrigins, getRateLimitBucketCountForTests } from "./security";
import { DocumentedProviderAdapter, LocalModelAdapter, MAX_PROVIDER_RESPONSE_BYTES, PROVIDER_TIMEOUT_MS, validateProviderEndpoint } from "./providers/adapters";
import { getConfiguredProvider } from "./providers/config";
import { isSafeProviderPayload } from "./security";
import { registerLocalApi } from "./localApi";

const requestOptions = (port: number) => ({ hostname: "127.0.0.1", port, path: "/api/local/usage", method: "OPTIONS" });
const validProviderEvent = {
  provider: "openai",
  model: "safe",
  timestamp: "2026-08-27T00:00:00.000Z",
  inputTokens: 10,
  outputTokens: 5,
  waterMetric: "consumption",
  locationSource: "unknown",
  requestType: "AI request",
  dataSource: "provider-api",
};

afterEach(() => {
  clearRateLimitBucketsForTests();
  vi.useRealTimers();
});

describe("security boundaries", () => {
  it("accepts the two default local origins and rejects every other origin", () => {
    const allowed = ["http://localhost:3000", "http://127.0.0.1:3000"];
    expect(isTrustedOrigin("http://localhost:3000", allowed)).toBe(true);
    expect(isTrustedOrigin("http://127.0.0.1:3000", allowed)).toBe(true);
    expect(isTrustedOrigin("https://unexpected.example", allowed)).toBe(false);
    expect(isTrustedOrigin("http://localhost:4000", allowed)).toBe(false);
    expect(isTrustedOrigin("null", allowed)).toBe(false);
    expect(isTrustedOrigin("https://evil.example", ["*"])).toBe(false);
  });
  it("ignores wildcard CORS configuration and treats no Origin as non-browser traffic", () => {
    const original = process.env.BYTE_DROP_CORS_ORIGINS;
    process.env.BYTE_DROP_CORS_ORIGINS = "*";
    expect(getAllowedCorsOrigins()).toEqual(["http://localhost:3000", "http://127.0.0.1:3000"]);
    expect(isTrustedOrigin(undefined, getAllowedCorsOrigins())).toBe(true);
    if (original === undefined) delete process.env.BYTE_DROP_CORS_ORIGINS; else process.env.BYTE_DROP_CORS_ORIGINS = original;
  });
  it("applies security headers to the root document and local API without global CORS", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    const app = express();
    app.use((_req, res, next) => {
      applySecurityHeaders(res);
      next();
    });
    app.get("/", (_req, res) => res.send("ok"));
    registerLocalApi(app);
    const server = app.listen(0);
    try {
      const port = (server.address() as { port: number }).port;
      for (const path of ["/", "/api/local/usage"]) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`);
        if (path === "/") expect(response.status).toBe(200);
        else expect([200, 503]).toContain(response.status);
        expect(response.headers.get("content-security-policy")).toBe(securityHeaders["Content-Security-Policy"]);
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("x-frame-options")).toBe("DENY");
        expect(response.headers.get("referrer-policy")).toBe("no-referrer");
        expect(response.headers.get("permissions-policy")).toContain("camera=()");
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
        await response.text();
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
    }
  });
  it("does not manufacture an Access-Control-Allow-Origin header for a request without Origin", async () => {
    const app = express();
    registerLocalApi(app);
    const server = app.listen(0);
    try {
      const port = (server.address() as { port: number }).port;
      const response = await new Promise<import("http").IncomingMessage>((resolve, reject) => {
        const request = import("http").then(({ request: httpRequest }) => {
          const pending = httpRequest(requestOptions(port), resolve);
          pending.on("error", reject);
          pending.end();
        });
        void request.catch(reject);
      });
      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("does not retain expired rate-limit buckets", () => {
    vi.useFakeTimers();
    const started = new Date("2026-01-01T00:00:00.000Z");
    vi.setSystemTime(started);
    expect(consumeRateLimit("expired-key", 1, 1_000)).toBe(true);
    vi.setSystemTime(new Date(started.getTime() + 1_001));
    expect(cleanupRateLimitBuckets(Date.now(), 1_000)).toBe(1);
    expect(consumeRateLimit("expired-key", 1, 1_000)).toBe(true);
  });
  it("does not permit external font domains in CSP", () => {
    expect(securityHeaders["Content-Security-Policy"]).not.toContain("fonts.googleapis.com");
    expect(securityHeaders["Content-Security-Policy"]).not.toContain("fonts.gstatic.com");
  });
  it("rate limits repeated keys without exposing details", () => {
    expect(consumeRateLimit("test-key", 1, 60_000)).toBe(true);
    expect(consumeRateLimit("test-key", 1, 60_000)).toBe(false);
    expect(privacySafeError()).toEqual({ error: "Unable to process the request. Please try again." });
    expect(securityHeaders["X-Frame-Options"]).toBe("DENY");
  });
  it("caps rate-limit bucket growth", () => {
    for (let index = 0; index < 2_000; index += 1) {
      expect(consumeRateLimit(`bucket-${index}`, 1, 60_000)).toBe(true);
    }
    expect(getRateLimitBucketCountForTests()).toBe(2_000);
    expect(consumeRateLimit("bucket-over-cap", 1, 60_000)).toBe(false);
  });
  it("rejects deeply nested and oversized JSON-shaped values", () => {
    const nested = { a: { b: { c: { d: { e: { f: { g: "<script>alert(1)</script>" } } } } } } };
    expect(hasSafeJsonDepth(nested)).toBe(false);
    expect(hasSafeJsonDepth({ model: "<script>alert(1)</script>" })).toBe(true);
  });
  it("uses error redirects and bounded abort signals for documented provider requests", async () => {
    const payload = JSON.stringify([validProviderEvent]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(payload, { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await new DocumentedProviderAdapter("openai", "https://api.openai.com/v1/usage").fetch();
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ headers: { Accept: "application/json" }, redirect: "error", signal: expect.any(AbortSignal) }));
    expect(fetchMock.mock.calls[0]?.[0]?.toString()).toBe("https://api.openai.com/v1/usage");
    vi.unstubAllGlobals();
  });
  it("accepts valid bounded responses and sends authentication headers server-side", async () => {
    const payload = JSON.stringify([validProviderEvent]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(payload, { status: 200, headers: { "content-type": "application/json", "content-length": String(new TextEncoder().encode(payload).byteLength) } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new DocumentedProviderAdapter("openai", "https://api.openai.com/v1/usage", "secret-key").fetch()).resolves.toMatchObject([{ provider: "openai", model: "safe", dataSource: "provider-api" }]);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ headers: { Accept: "application/json", Authorization: "Bearer secret-key" } }));
    vi.unstubAllGlobals();
  });
  it("rejects oversized declared and streamed provider responses with a generic error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200, headers: { "content-length": String(MAX_PROVIDER_RESPONSE_BYTES + 1) } })));
    await expect(new DocumentedProviderAdapter("openai", "https://api.openai.com/v1/usage").fetch()).rejects.toThrow("Provider request unavailable");
    const oversized = new Uint8Array(MAX_PROVIDER_RESPONSE_BYTES + 1);
    oversized.fill(91);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(oversized, { status: 200 })));
    await expect(new LocalModelAdapter("http://127.0.0.1:11434/usage").fetch()).rejects.toThrow("Provider request unavailable");
    vi.unstubAllGlobals();
  });
  it("rejects malformed JSON and unsupported response shapes safely", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
    await expect(new DocumentedProviderAdapter("openai", "https://api.openai.com/v1/usage").fetch()).rejects.toThrow("Provider request unavailable");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ provider: "openai" }), { status: 200 })));
    await expect(new DocumentedProviderAdapter("openai", "https://api.openai.com/v1/usage").fetch()).rejects.toThrow("Provider request unavailable");
    vi.unstubAllGlobals();
  });
  it("handles provider aborts with a generic safe error and clears the bounded timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: URL, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = new DocumentedProviderAdapter("openai", "https://api.openai.com/v1/usage").fetch();
    const rejection = expect(pending).rejects.toThrow("Provider request unavailable");
    await vi.advanceTimersByTimeAsync(PROVIDER_TIMEOUT_MS + 1);
    await rejection;
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }));
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  describe("strict provider event validation", () => {
    async function fetchPayload(payload: unknown) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } })));
      return new DocumentedProviderAdapter("openai", "https://api.openai.com/v1/usage").fetch();
    }

    it("accepts a valid event", async () => {
      await expect(fetchPayload([validProviderEvent])).resolves.toHaveLength(1);
      vi.unstubAllGlobals();
    });
    it("rejects an event missing every legitimate measurement", async () => {
      const { inputTokens: _inputTokens, outputTokens: _outputTokens, ...missingMeasurement } = validProviderEvent;
      await expect(fetchPayload([missingMeasurement])).rejects.toThrow("Provider request unavailable");
      vi.unstubAllGlobals();
    });
    it("rejects an invalid provider", async () => {
      await expect(fetchPayload([{ ...validProviderEvent, provider: "meta" }])).rejects.toThrow("Provider request unavailable");
      vi.unstubAllGlobals();
    });
    it("rejects an invalid model", async () => {
      await expect(fetchPayload([{ ...validProviderEvent, model: "" }])).rejects.toThrow("Provider request unavailable");
      vi.unstubAllGlobals();
    });
    it("rejects an invalid timestamp", async () => {
      await expect(fetchPayload([{ ...validProviderEvent, timestamp: "not-a-date" }])).rejects.toThrow("Provider request unavailable");
      vi.unstubAllGlobals();
    });
    it("rejects an oversized numeric field", async () => {
      await expect(fetchPayload([{ ...validProviderEvent, inputTokens: 100_000_001 }])).rejects.toThrow("Provider request unavailable");
      vi.unstubAllGlobals();
    });
    it("rejects a malformed event", async () => {
      await expect(fetchPayload([null])).rejects.toThrow("Provider request unavailable");
      vi.unstubAllGlobals();
    });
    it("rejects a mixed valid and invalid response", async () => {
      await expect(fetchPayload([validProviderEvent, { ...validProviderEvent, model: "" }])).rejects.toThrow("Provider request unavailable");
      vi.unstubAllGlobals();
    });
    it("rejects a malicious nested object", async () => {
      await expect(fetchPayload([{ ...validProviderEvent, model: { nested: "payload" } }])).rejects.toThrow("Provider request unavailable");
      vi.unstubAllGlobals();
    });
    it("accepts a valid multi-event response", async () => {
      await expect(fetchPayload([validProviderEvent, { ...validProviderEvent, model: "second" }])).resolves.toHaveLength(2);
      vi.unstubAllGlobals();
    });
  });
  it("rejects arbitrary provider hosts and private remote targets", () => {
    expect(() => validateProviderEndpoint("openai", "http://api.openai.com/usage")).toThrow();
    expect(() => validateProviderEndpoint("openai", "https://example.com/usage")).toThrow();
    expect(() => validateProviderEndpoint("openai", "https://api.openai.com/usage?api_key=secret")).toThrow();
    expect(() => validateProviderEndpoint("openai", "https://user:password@api.openai.com/usage")).toThrow();
    expect(() => validateProviderEndpoint("openai", "ftp://api.openai.com/usage")).toThrow();
    expect(() => validateProviderEndpoint("openai", "https://localhost/usage")).toThrow();
    expect(() => validateProviderEndpoint("local", "http://example.com/usage")).toThrow();
    expect(() => validateProviderEndpoint("local", "https://10.0.0.1/usage")).toThrow();
    expect(validateProviderEndpoint("local", "http://127.0.0.1:11434/usage").hostname).toBe("127.0.0.1");
    expect(() => validateProviderEndpoint("local", "http://localhost:11434/usage")).toThrow();
    expect(() => validateProviderEndpoint("openai", "https://api.openai.com:8443/usage")).toThrow();
    expect(isSafeProviderPayload([{ provider: "local", model: "safe" }])).toBe(true);
    expect(isSafeProviderPayload(Array.from({ length: 501 }, () => ({ provider: "local" })))).toBe(false);
  });
  it("does not create a hidden provider fallback when configuration is absent or unsafe", () => {
    const key = "BYTE_DROP_PROVIDER_OPENAI_ENDPOINT";
    const original = process.env[key];
    delete process.env[key];
    expect(getConfiguredProvider("openai")).toBeNull();
    process.env[key] = "https://example.com/usage";
    expect(getConfiguredProvider("openai")).toBeNull();
    if (original === undefined) delete process.env[key]; else process.env[key] = original;
  });
});
