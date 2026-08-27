import { z } from "zod";
import { providerSchema, providerUsageResponseSchema, type NormalizedUsageEvent } from "./index";

const documentedHosts: Record<string, string[]> = {
  openai: ["api.openai.com"],
  anthropic: ["api.anthropic.com"],
  google: ["generativelanguage.googleapis.com"],
  microsoft: ["management.azure.com"],
  xai: ["api.x.ai"],
  perplexity: ["api.perplexity.ai"],
  mistral: ["api.mistral.ai"],
  deepseek: ["api.deepseek.com"],
};

export function validateProviderEndpoint(provider: z.infer<typeof providerSchema>, rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && !(provider === "local" && url.protocol === "http:")) throw new Error("Provider endpoint must use HTTPS");
  if (url.username || url.password || url.pathname.includes("..") || /(?:api[_-]?key|token|secret|authorization|bearer)/i.test(url.search)) throw new Error("Provider endpoint is not allowed");
  const hostname = url.hostname.toLowerCase();
  if (provider === "local") {
    if (!["127.0.0.1", "[::1]"].includes(hostname)) throw new Error("Local adapter only accepts literal loopback endpoints");
  } else {
    if (url.port && url.port !== "443") throw new Error("External provider endpoint must use HTTPS port 443");
    if (!documentedHosts[provider]?.includes(hostname)) throw new Error("Provider endpoint is not on the documented allowlist");
  }
  return url;
}


export interface UsageFetcher { fetch(): Promise<NormalizedUsageEvent[]>; }

type ExternalProvider = Exclude<z.infer<typeof providerSchema>, "local">;
export const PROVIDER_TIMEOUT_MS = 15_000;
export const MAX_PROVIDER_RESPONSE_BYTES = 256 * 1024;
const GENERIC_PROVIDER_ERROR = "Provider request unavailable";

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > MAX_PROVIDER_RESPONSE_BYTES) throw new Error(GENERIC_PROVIDER_ERROR);
  }

  if (!response.body) throw new Error(GENERIC_PROVIDER_ERROR);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_PROVIDER_RESPONSE_BYTES) throw new Error(GENERIC_PROVIDER_ERROR);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}

async function fetchProviderResponse(url: URL, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers, redirect: "error", signal: controller.signal });
    if (!response.ok) throw new Error(GENERIC_PROVIDER_ERROR);
    return await readBoundedJson(response);
  } catch {
    throw new Error(GENERIC_PROVIDER_ERROR);
  } finally {
    clearTimeout(timeout);
  }
}

function authenticationHeaders(provider: ExternalProvider, apiKey?: string): Record<string, string> {
  if (!apiKey) return {};
  switch (provider) {
    case "anthropic": return { "x-api-key": apiKey };
    case "google": return { "x-goog-api-key": apiKey };
    case "microsoft": return { "api-key": apiKey };
    case "openai":
    case "xai":
    case "perplexity":
    case "mistral":
    case "deepseek": return { Authorization: `Bearer ${apiKey}` };
  }
}

export class DocumentedProviderAdapter implements UsageFetcher {
  constructor(public readonly provider: ExternalProvider, protected readonly endpoint: string, protected readonly apiKey?: string) {}
  async fetch() {
    try {
      const url = validateProviderEndpoint(this.provider, this.endpoint);
      const payload = await fetchProviderResponse(url, { Accept: "application/json", ...authenticationHeaders(this.provider, this.apiKey) });
      return providerUsageResponseSchema.parse(payload);
    } catch {
      throw new Error(GENERIC_PROVIDER_ERROR);
    }
  }
}

export class LocalModelAdapter implements UsageFetcher {
  constructor(private readonly endpoint: string) {}
  async fetch() {
    try {
      const url = validateProviderEndpoint("local", this.endpoint);
      const payload = await fetchProviderResponse(url, { Accept: "application/json" });
      return providerUsageResponseSchema.parse(payload);
    } catch {
      throw new Error(GENERIC_PROVIDER_ERROR);
    }
  }
}
