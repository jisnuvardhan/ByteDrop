import { providerSchema } from "./index";
import type { z } from "zod";

type Provider = z.infer<typeof providerSchema>;
import { DocumentedProviderAdapter, validateProviderEndpoint } from "./adapters";

const envKey = (provider: Provider, suffix: "ENDPOINT" | "API_KEY") =>
  `BYTE_DROP_PROVIDER_${provider.toUpperCase()}_${suffix}`;

export type ConfiguredProvider = {
  provider: Provider;
  endpoint: string;
  apiKey?: string;
};

export function getConfiguredProvider(providerInput: string): ConfiguredProvider | null {
  const parsed = providerSchema.safeParse(providerInput);
  if (!parsed.success) return null;
  const provider = parsed.data;
  const endpoint = process.env[envKey(provider, "ENDPOINT")];
  if (!endpoint) return null;
  let validatedEndpoint: URL;
  try {
    validatedEndpoint = validateProviderEndpoint(provider, endpoint);
  } catch {
    return null;
  }
  const apiKey = process.env[envKey(provider, "API_KEY")];
  return { provider, endpoint: validatedEndpoint.toString(), ...(apiKey ? { apiKey } : {}) };
}

export function listConfiguredProviders(): Provider[] {
  return providerSchema.options.filter((provider) => Boolean(getConfiguredProvider(provider)));
}

export function createConfiguredProviderAdapter(providerInput: string): DocumentedProviderAdapter | null {
  const configured = getConfiguredProvider(providerInput);
  if (!configured || configured.provider === "local") return null;
  return new DocumentedProviderAdapter(configured.provider, configured.endpoint, configured.apiKey);
}
