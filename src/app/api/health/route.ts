import { NextResponse } from "next/server";
import { getPool } from "@/server/pool";

/** Liveness + DB readiness probe for Docker / reverse proxy. */
export async function GET() {
  try {
    await getPool().query("SELECT 1");
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "db_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
