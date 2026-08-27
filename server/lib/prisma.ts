import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

type PrismaClientInstance = import("@prisma/client").PrismaClient;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClientInstance;
};

function getDatabaseAdapter() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const configuredConnectionLimit =
    process.env.DATABASE_CONNECTION_LIMIT ?? "30";
  const connectionLimit = Number(configuredConnectionLimit);
  if (!Number.isSafeInteger(connectionLimit) || connectionLimit <= 0) {
    throw new Error(
      "DATABASE_CONNECTION_LIMIT must be a positive safe integer.",
    );
  }

  const poolUrl = new URL(url);
  poolUrl.searchParams.set("connectionLimit", String(connectionLimit));
  return new PrismaMariaDb(poolUrl.toString());
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
