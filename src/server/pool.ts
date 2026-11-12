import { Pool } from "pg";

declare global {
  var __pamPool: Pool | undefined;
}

/** Single pg pool per process (survives Next.js dev hot reloads). */
export function getPool(): Pool {
  if (!globalThis.__pamPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    globalThis.__pamPool = new Pool({ connectionString, max: Number(process.env.PG_POOL_MAX ?? 10) });
  }
  return globalThis.__pamPool;
}
