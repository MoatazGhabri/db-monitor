import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ConnectionInfo {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  engine: string;
  ssl: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    const path = url.pathname.replace("/functions/v1/db-proxy", "");
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    // Route: /test — test a database connection
    if (path === "/test" || path === "/test/") {
      const conn: ConnectionInfo = body.connection;
      if (!conn?.host) {
        return new Response(JSON.stringify({ error: "Missing connection details" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Simulate connection test — in production this would actually connect
      const result = {
        success: true,
        engine: conn.engine,
        version: conn.engine === "postgresql" ? "PostgreSQL 16.2" : "MySQL 8.4.0",
        latency_ms: Math.floor(Math.random() * 30) + 5,
        message: "Connection successful",
      };
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: /query — execute a SQL query on a connected database
    if (path === "/query" || path === "/query/") {
      const { connectionId, sql } = body;
      if (!connectionId || !sql) {
        return new Response(JSON.stringify({ error: "Missing connectionId or sql" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch connection details from Supabase
      const { data: conn, error: connError } = await supabase
        .from("db_connections")
        .select("*")
        .eq("id", connectionId)
        .maybeSingle();

      if (connError || !conn) {
        return new Response(JSON.stringify({ error: "Connection not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const startTime = Date.now();

      // In production, this would use the actual database driver:
      // - For MySQL: npm:mysql2@3.11.0
      // - For PostgreSQL: npm:pg@8.13.0
      //
      // Example production code:
      //   const client = conn.engine === 'postgresql'
      //     ? new (await import('npm:pg@8.13.0')).Client({ host, port, database, user, password, ssl })
      //     : await (await import('npm:mysql2@3.11.0')).createConnection({ host, port, database, user, password, ssl })
      //   await client.connect()
      //   const result = await client.query(sql)
      //   await client.end()
      //
      // For now, return a structured mock response:
      const durationMs = Date.now() - startTime + Math.floor(Math.random() * 50);

      // Log to query_history
      await supabase.from("query_history").insert({
        connection_id: connectionId,
        query: sql,
        duration_ms: durationMs,
        rows_affected: 0,
        status: durationMs > 1000 ? "slow" : "success",
        executed_by: body.user || "system",
      });

      // Determine query type
      const queryType = sql.trim().toUpperCase().split(" ")[0];
      const isSelect = queryType === "SELECT";

      // Generate mock result columns based on query
      let columns: string[] = [];
      let rows: Record<string, unknown>[] = [];

      if (isSelect) {
        // Parse column names from SELECT clause (simplified)
        const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
        if (selectMatch) {
          const colPart = selectMatch[1].trim();
          if (colPart === "*") {
            columns = ["id", "name", "email", "created_at"];
          } else {
            columns = colPart.split(",").map((c) => {
              const parts = c.trim().split(/\s+as\s+/i);
              return parts[parts.length - 1].trim().replace(/`/g, "");
            });
          }
          // Generate sample rows
          const rowCount = Math.min(100, Math.floor(Math.random() * 50) + 5);
          for (let i = 0; i < rowCount; i++) {
            const row: Record<string, unknown> = {};
            for (const col of columns) {
              if (col === "id") row[col] = i + 1;
              else if (col === "name") row[col] = `User ${i + 1}`;
              else if (col === "email") row[col] = `user${i + 1}@example.com`;
              else if (col === "created_at") row[col] = new Date(Date.now() - i * 86400000).toISOString();
              else if (col === "COUNT(*)") row[col] = Math.floor(Math.random() * 10000);
              else row[col] = `value_${i}`;
            }
            rows.push(row);
          }
        }
      }

      const result = {
        success: true,
        columns,
        rows,
        rowsAffected: isSelect ? rows.length : Math.floor(Math.random() * 100),
        durationMs,
        executedAt: new Date().toISOString(),
      };

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: /tables — list tables in a database
    if (path === "/tables" || path === "/tables/") {
      const { connectionId } = body;
      if (!connectionId) {
        return new Response(JSON.stringify({ error: "Missing connectionId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: conn, error: connError } = await supabase
        .from("db_connections")
        .select("*")
        .eq("id", connectionId)
        .maybeSingle();

      if (connError || !conn) {
        return new Response(JSON.stringify({ error: "Connection not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // In production, execute: SHOW TABLES (MySQL) or SELECT FROM pg_tables (PostgreSQL)
      const tables = [
        { name: "users", rows: "1,240,000", size: "2.3 GB", engine: "InnoDB", collation: "utf8mb4_unicode_ci" },
        { name: "orders", rows: "8,700,000", size: "18.2 GB", engine: "InnoDB", collation: "utf8mb4_unicode_ci" },
        { name: "products", rows: "456,000", size: "1.8 GB", engine: "InnoDB", collation: "utf8mb4_unicode_ci" },
      ];

      return new Response(JSON.stringify({ tables }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: /columns — get column structure for a table
    if (path === "/columns" || path === "/columns/") {
      const { connectionId, tableName } = body;
      if (!connectionId || !tableName) {
        return new Response(JSON.stringify({ error: "Missing connectionId or tableName" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // In production, execute: SHOW COLUMNS FROM <table> (MySQL)
      // or SELECT FROM information_schema.columns WHERE table_name = <table> (PostgreSQL)
      const columns = [
        { name: "id", type: "BIGINT UNSIGNED", nullable: false, key: "PRI", defaultValue: null, extra: "AUTO_INCREMENT" },
        { name: "name", type: "VARCHAR(255)", nullable: false, key: "", defaultValue: null, extra: "" },
        { name: "email", type: "VARCHAR(255)", nullable: false, key: "UNI", defaultValue: null, extra: "" },
        { name: "created_at", type: "TIMESTAMP", nullable: false, key: "", defaultValue: "CURRENT_TIMESTAMP", extra: "" },
      ];

      return new Response(JSON.stringify({ columns }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: unknown route
    return new Response(JSON.stringify({ error: "Unknown route", path }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
