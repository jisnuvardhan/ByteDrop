import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "node:path";
import { PrismaClient, type UsageEvent } from "../../generated/prisma/client";
import type { FootprintResult } from "./calculation";
import type { UsageEventInput } from "../providers";

let client: PrismaClient | undefined;

export function getLocalDb() {
  if (!client) {
    const configuredUrl = process.env.DATABASE_URL;
    const rawUrl = configuredUrl?.startsWith("file:") ? configuredUrl : "file:../byte-drop.local.db";
    const filePath = rawUrl.slice("file:".length);
    const url = `file:${path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)}`;
    process.env.DATABASE_URL = url;
    const adapter = new PrismaLibSql({ url });
    client = new PrismaClient({ adapter });
  }
  return client;
}

export async function recordUsage(input: UsageEventInput, footprint: FootprintResult): Promise<UsageEvent> {
  return getLocalDb().usageEvent.create({
    data: {
      provider: input.provider,
      model: input.model,
      timestamp: input.timestamp,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      requestType: input.requestType,
      energyKwh: footprint.energyKwh,
      energyMethod: footprint.energyMethod,
      energyMethodVersion: footprint.energyMethodVersion,
      energySource: footprint.energySource,
      pue: footprint.pue,
      pueSource: footprint.pueSource,
      pueVersion: footprint.pueVersion,
      pueEffectiveDate: footprint.pueEffectiveDate,
      onsiteWue: footprint.onsiteWue,
      onsiteWueSource: footprint.onsiteWueSource,
      onsiteWueVersion: footprint.onsiteWueVersion,
      onsiteWueEffectiveDate: footprint.onsiteWueEffectiveDate,
      offsiteWaterIntensity: footprint.offsiteWaterIntensity,
      offsiteWaterSource: footprint.offsiteWaterSource,
      offsiteWaterVersion: footprint.offsiteWaterVersion,
      offsiteWaterEffectiveDate: footprint.offsiteWaterEffectiveDate,
      locationSource: footprint.locationSource,
      waterLiters: footprint.waterLiters,
      waterGallons: footprint.waterGallons,
      waterUnit: footprint.waterUnit,
      waterMetric: footprint.waterMetric,
      provenance: footprint.provenance,
      methodology: footprint.methodology,
      methodologyVersion: footprint.methodologyVersion,
      source: footprint.source,
      confidence: footprint.confidence,
      limitation: footprint.limitation,
    },
  });
}

export async function listUsage(limit = 100, offset = 0): Promise<UsageEvent[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const safeOffset = Math.min(Math.max(Math.trunc(offset), 0), 10_000);
  return getLocalDb().usageEvent.findMany({ orderBy: { timestamp: "desc" }, take: safeLimit, skip: safeOffset });
}

export async function clearUsage(): Promise<void> {
  await getLocalDb().usageEvent.deleteMany();
}
