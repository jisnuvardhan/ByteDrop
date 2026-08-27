import { afterEach, describe, expect, it, vi } from "vitest";
import { createConfiguredProviderAdapter, getConfiguredProvider, listConfiguredProviders } from "./config";

afterEach(() => {
  delete process.env.BYTE_DROP_PROVIDER_OPENAI_ENDPOINT;
  delete process.env.BYTE_DROP_PROVIDER_OPENAI_API_KEY;
  delete process.env.BYTE_DROP_PROVIDER_LOCAL_ENDPOINT;
});

describe("server-only provider configuration", () => {
  it("returns no configured providers by default", () => {
    expect(listConfiguredProviders()).toEqual([]);
  });

  it("accepts only an explicitly configured documented endpoint", () => {
    process.env.BYTE_DROP_PROVIDER_OPENAI_ENDPOINT = "https://api.openai.com/v1/usage";
    process.env.BYTE_DROP_PROVIDER_OPENAI_API_KEY = "server-only-test-value";
    expect(getConfiguredProvider("openai")).toMatchObject({
      provider: "openai",
      endpoint: "https://api.openai.com/v1/usage",
      apiKey: "server-only-test-value",
    });
  });

  it("rejects arbitrary or unsafe endpoints without throwing secrets", () => {
    process.env.BYTE_DROP_PROVIDER_OPENAI_ENDPOINT = "http://127.0.0.1:8080/metadata";
    expect(getConfiguredProvider("openai")).toBeNull();
    process.env.BYTE_DROP_PROVIDER_OPENAI_ENDPOINT = "https://api.openai.com:8443/v1/usage";
    expect(getConfiguredProvider("openai")).toBeNull();
    expect(getConfiguredProvider("unknown")).toBeNull();
  });

  it("constructs an authenticated server-side adapter without exposing the key in the URL", async () => {
    const payload = JSON.stringify([{ provider: "openai", model: "safe", timestamp: "2026-08-27T00:00:00.000Z", inputTokens: 1, dataSource: "provider-api" }]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(payload, { status: 200, headers: { "content-type": "application/json", "content-length": String(new TextEncoder().encode(payload).byteLength) } }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.BYTE_DROP_PROVIDER_OPENAI_ENDPOINT = "https://api.openai.com/v1/usage";
    process.env.BYTE_DROP_PROVIDER_OPENAI_API_KEY = "server-only-test-value";
    const adapter = createConfiguredProviderAdapter("openai");
    expect(adapter).not.toBeNull();
    await adapter?.fetch();
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      headers: { Accept: "application/json", Authorization: "Bearer server-only-test-value" },
      redirect: "error",
      signal: expect.any(AbortSignal),
    }));
    expect(fetchMock.mock.calls[0]?.[0]?.toString()).toBe("https://api.openai.com/v1/usage");
    vi.unstubAllGlobals();
  });
});
