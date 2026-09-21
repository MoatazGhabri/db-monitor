# DBHub — Database Administration Platform

## Storage Architecture

The platform supports **two storage modes**:

### Mode 1: Local (default) — everything on your VPS/machine

All platform data (connections, schedules, query history) is stored in a **SQLite database** that lives on your server's disk inside a Docker volume. No cloud services required. The local API server also connects directly to your MySQL/PostgreSQL/MariaDB databases to execute real queries.

### Mode 2: Supabase — cloud metadata

Platform metadata is stored in Supabase's hosted PostgreSQL. Queries go through a Supabase Edge Function. Useful if you want the platform's config to persist across server rebuilds without managing volumes.

Switch modes by setting `VITE_API_MODE` in `.env`:
```
VITE_API_MODE=local       # or "supabase"
```

---

## Deploy with Docker (local mode)

### Quick start (VPS or local machine)

```bash
# 1. Clone the project to your VPS
git clone <your-repo> dbhub
cd dbhub

# 2. Build and run both containers
docker compose up -d --build

# 3. Access the platform
# Open http://YOUR_VPS_IP:8080
```

That's it. Two containers start:
- **dbhub-server** — Node.js API with SQLite (port 3001, internal only)
- **dbhub-admin** — Nginx serving the frontend (port 8080, public)

Data is persisted in a Docker volume called `dbhub-data`. The SQLite file lives at `/app/data/dbhub.db` inside the server container.

### Where your data is stored

| Data | Location |
|------|----------|
| Database connections (host, credentials) | SQLite file on VPS disk (`dbhub-data` volume) |
| Cloud drive configurations | SQLite file on VPS disk |
| Backup schedules (cron, retention) | SQLite file on VPS disk |
| Query history (audit log) | SQLite file on VPS disk |
| Your actual databases (MySQL/PostgreSQL) | Stay where they are — the platform connects to them remotely |

The SQLite file persists across container restarts via the Docker volume. To back up the platform's own data, copy the volume:
```bash
docker run --rm -v dbhub-data:/data -v $(pwd):/backup alpine tar czf /backup/dbhub-data.tar.gz /data
```

### Connecting your databases

1. Open the platform at `http://YOUR_VPS_IP:8080`
2. Go to **Databases** → **Connect Database**
3. Enter your database details:
   - **Name**: A display name (e.g., `ecommerce_prod`)
   - **Engine**: MySQL, PostgreSQL, or MariaDB
   - **Host**: Your database server IP or hostname
   - **Port**: 3306 (MySQL/MariaDB) or 5432 (PostgreSQL)
   - **Database Name**: The actual database name on the server
   - **Username / Password**: DB credentials
   - **SSL**: Enable if your server requires encrypted connections
4. Click **Test Connection** to verify, then **Connect** to save

The local server connects to your databases **directly** using real drivers (mysql2, pg). Queries execute against your real databases — no simulation.

### Running queries

1. Go to **SQL Editor**
2. Select a connection from the dropdown
3. Write your SQL query
4. Press **Run Query** or Ctrl+Enter (Cmd+Enter on Mac)
5. Results appear with real column headers and row data
6. Every query is logged in **Query History** automatically

### Backup configuration

1. Go to **Backups** → **Connect Drive** to link a cloud storage provider
2. Click **New Backup** to create a schedule:
   - Select the database and destination drive
   - Choose frequency (daily, every 2 days, weekly, or custom cron)
   - Set retention policy (e.g., "Keep last 2 backups" = today + yesterday)
3. When a new backup completes, older ones beyond the limit are auto-deleted

---

## Local development (without Docker)

```bash
# Terminal 1: Start the API server
cd server
npm install
npm start

# Terminal 2: Start the frontend dev server
npm install
npm run dev
```

The frontend dev server proxies `/api` requests to `http://localhost:3001` automatically.

---

## Switching to Supabase mode

If you prefer cloud metadata storage:

1. Set in `.env`:
```
VITE_API_MODE=supabase
```
2. Ensure Supabase credentials are in `.env` (already pre-configured):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```
3. Rebuild: `docker compose up -d --build`

In Supabase mode, the platform stores metadata in four Supabase tables (`db_connections`, `cloud_drives`, `backup_schedules`, `query_history`) and routes queries through the `db-proxy` edge function.

---

## Production notes

- In local mode, database passwords are stored in SQLite as-is. For production hardening, encrypt passwords before storage (e.g., using AES with a server-side key).
- The local server opens connections to your databases on demand and closes them after each query. For high-throughput scenarios, consider adding a connection pool.
- The Docker volume `dbhub-data` ensures data survives container rebuilds. If you delete the volume, all platform configuration is lost.
