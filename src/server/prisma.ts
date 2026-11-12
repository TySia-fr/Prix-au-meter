import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getPool } from "./pool";

declare global {
  var __pamPrisma: PrismaClient | undefined;
}

/** Prisma 7 (Rust-free client) on top of the shared pg pool. */
export function getPrisma(): PrismaClient {
  globalThis.__pamPrisma ??= new PrismaClient({ adapter: new PrismaPg(getPool()) });
  return globalThis.__pamPrisma;
}
