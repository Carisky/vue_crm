import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } =
  require("@prisma/client") as typeof import("@prisma/client");
const { PrismaMariaDb } =
  require("@prisma/adapter-mariadb") as typeof import("@prisma/adapter-mariadb");

type PrismaClientInstance = import("@prisma/client").PrismaClient;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClientInstance;
};

function getDatabaseAdapter() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not defined.");
  }
  return new PrismaMariaDb(url);
}

function createPrismaClient() {
  return new PrismaClient({
    adapter: getDatabaseAdapter(),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
