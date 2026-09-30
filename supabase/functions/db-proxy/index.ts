import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import mysql from "npm:mysql2@3.11.0/promise";
import pg from "npm:pg@8.13.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface ConnectionInfo {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  engine: string;
  ssl: boolean;
}

const isPg = (engine: string) => engine === "postgresql";

/** Turn a raw driver error into something an admin can act on. */
function friendlyError(err: unknown, conn: ConnectionInfo): string {
  const code = (err as { code?: string })?.code;
  const message = err instanceof Error ? err.message : String(err);
  const target = `${conn.host}:${conn.port}`;
  switch (code) {
    case "ECONNREFUSED":
      return `Connection refused by ${target}. Check that the database server is running, the port is correct, and that it accepts remote connections.`;
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `Host "${conn.host}" could not be resolved. Check the host name / IP address.`;
    case "ETIMEDOUT":
      return `Timed out while reaching ${target}. A firewall may be blocking the port.`;
    case "ER_ACCESS_DENIED_ERROR":
    case "28P01":
      return `Access denied for user "${conn.username}". Check the username and password.`;
    case "ER_BAD_DB_ERROR":
    case "3D000":
      return `Database "${conn.database}" does not exist on ${target}.`;
    default:
      return message;
  }
}

/** Open a short-lived connection to the target database (8s connect timeout). */
async function openHandle(conn: ConnectionInfo) {
  if (isPg(conn.engine)) {
    const client = new pg.Client({
      host: conn.host,
      port: Number(conn.port) || 5432,
      database: conn.database,
      user: conn.username,
      password: conn.password,
      ssl: conn.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 8000,
      statement_timeout: 30000,
    });
    await client.connect();
    return {
      type: "pg" as const,
      query: async (sql: string) => {
        const res = await client.query(sql);
        return { columns: res.fields?.map((f) => f.name) ?? [], rows: res.rows ?? [], rowsAffected: res.rowCount ?? 0 };
      },
      version: async () => (await client.query("SELECT version() AS v")).rows[0].v as string,
      close: () => client.end(),
    };
  }
  const client = await mysql.createConnection({
    host: conn.host,
    port: Number(conn.port) || 3306,
    database: conn.database,
    user: conn.username,
    password: conn.password,
    ssl: conn.ssl ? {} : undefined,
    connectTimeout: 8000,
    dateStrings: true,
  });
  return {
    type: "mysql" as const,
    query: async (sql: string) => {
      const [result, fields] = await client.query(sql);
      if (Array.isArray(result)) {
        return { columns: (fields ?? []).map((f) => f.name), rows: result as Record<string, unknown>[], rowsAffected: result.length };
      }
      const info = result as { affectedRows?: number };
      return { columns: [], rows: [], rowsAffected: info.affectedRows ?? 0 };
    },
    version: async () => {
      const [rows] = await client.query("SELECT VERSION() AS v");
      return (rows as { v: string }[])[0].v;
    },
    close: () => client.end(),
  };
}

/** JSON-safe cell values (BigInt, Buffer, Date…). */
function cleanRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === "bigint") out[k] = v.toString();
      else if (v instanceof Uint8Array) out[k] = `0x${Array.from(v.subarray(0, 32)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
      else if (v instanceof Date) out[k] = v.toISOString();
      else out[k] = v;
    }
    return out;
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = new URL(req.url);
    const path = url.pathname.replace("/functions/v1/db-proxy", "").replace(/\/$/, "");
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    // Route: /test — actually connect to the database and report the real outcome.
    if (path === "/test") {
      const conn: ConnectionInfo = body.connection;
      if (!conn?.host || !conn?.database || !conn?.username) {
        return json({ success: false, engine: conn?.engine ?? "", version: "", latency_ms: 0, message: "Host, database name and username are required" });
      }
      const start = Date.now();
      let handle: Awaited<ReturnType<typeof openHandle>> | null = null;
      try {
        handle = await openHandle(conn);
        const version = await handle.version();
        return json({ success: true, engine: conn.engine, version, latency_ms: Date.now() - start, message: "Connection successful" });
      } catch (err) {
        return json({ success: false, engine: conn.engine, version: "", latency_ms: 0, message: friendlyError(err, conn) });
      } finally {
        await handle?.close().catch(() => {});
      }
    }

    // Route: /query — actually execute the SQL on the target database.
    if (path === "/query") {
      const { connectionId, sql } = body;
      if (!connectionId || !sql) return json({ error: "Missing connectionId or sql" }, 400);

      const { data: connRow, error: connError } = await supabase.from("db_connections").select("*").eq("id", connectionId).maybeSingle();
      if (connError || !connRow) return json({ error: "Connection not found" }, 404);

      const conn: ConnectionInfo = {
        host: connRow.host, port: connRow.port, database: connRow.database_name,
        username: connRow.username, password: connRow.password_encrypted,
        engine: connRow.engine, ssl: !!connRow.ssl_enabled,
      };

      const start = Date.now();
      let handle: Awaited<ReturnType<typeof openHandle>> | null = null;
      try {
        handle = await openHandle(conn);
        const result = await handle.query(sql);
        const durationMs = Date.now() - start;
        await supabase.from("query_history").insert({
          connection_id: connectionId, query: sql, duration_ms: durationMs,
          rows_affected: result.rowsAffected, status: durationMs > 1000 ? "slow" : "success", executed_by: body.user || "system",
        });
        return json({ success: true, columns: result.columns, rows: cleanRows(result.rows), rowsAffected: result.rowsAffected, durationMs, executedAt: new Date().toISOString() });
      } catch (err) {
        const durationMs = Date.now() - start;
        const message = friendlyError(err, conn);
        await supabase.from("query_history").insert({
          connection_id: connectionId, query: sql, duration_ms: durationMs, rows_affected: 0, status: "error", executed_by: body.user || "system",
        });
        return json({ success: false, error: message, columns: [], rows: [], rowsAffected: 0, durationMs, executedAt: new Date().toISOString() });
      } finally {
        await handle?.close().catch(() => {});
      }
    }

    return json({ error: "Unknown route", path }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
  }
});
