import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

function databaseUrl() {
  const raw = process.env.DATABASE_URL ?? "file:../byte-drop.local.db";
  if (!raw.startsWith("file:")) return raw;
  const filePath = raw.slice("file:".length);
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  return `file:${absolutePath}`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl(),
  },
});
