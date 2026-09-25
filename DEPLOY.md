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
# Open http://YOUR_VPS_IP:8090
```

That's it. Two containers start:
- **dbhub-server** — Node.js API with SQLite (port 3002, internal only)
- **dbhub-admin** — Nginx serving the frontend (port 8090, public)

Every page of DBHub is backed by this API — nothing in the UI is sample data:
- **Databases / Tables** — real connections, live schema, paginated real rows.
- **Monitoring** — host CPU/RAM/disk sampled from the container, and live per-database status (connections, query rate, active queries) sampled from MySQL/MariaDB/PostgreSQL system views.
- **Query History** — every query run from the SQL editor, logged with timing and status.
- **Users & Permissions** — the real accounts and grants on each connected database (read-only; DBHub does not create or alter accounts).
- **Backups** — real `mysqldump`-equivalent / `pg_dump`-equivalent SQL dumps, gzip-compressed, restorable, on a cron schedule, with optional upload to **Google Drive** (via a free Google Cloud service account — no browser sign-in needed at backup time), a local folder, WebDAV (Nextcloud/ownCloud/Synology) or S3-compatible storage (AWS S3, Backblaze B2, Wasabi, MinIO, R2…). Setup steps for each are shown right in the "Add Backup Destination" dialog.
- **Notifications** — Settings → Notifications can send an alert (backup failed / succeeded, connection down, disk almost full) to **Telegram** (a bot messages you directly — setup steps shown in the app), Slack, or any webhook.
- **Import / Export** — real SQL/CSV/JSON import and export against the selected database.
- **Settings** — profile, notification webhooks (Slack/generic) and preferences, persisted on the server.

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

1. Open the platform at `http://YOUR_VPS_IP:8090`
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

When you click **Connect**, DBHub saves the connection **and immediately connects** to it: the status becomes `online` (with the real table count and size) or stays `offline` with the reason shown under the name. Statuses are re-checked every time the Databases page is opened or refreshed, and each row has a **Re-check** button.

**Database installed on the same VPS?** Inside Docker, `localhost` / `127.0.0.1` is redirected to the Docker host (`host.docker.internal`). The database must then accept connections from the Docker network:
- MySQL/MariaDB: `bind-address = 0.0.0.0` (or the docker bridge IP) and a user allowed from `%` / `172.16.0.0/12`
- PostgreSQL: `listen_addresses = '*'` and a matching line in `pg_hba.conf` (e.g. `host all all 172.16.0.0/12 scram-sha-256`)

### Browsing tables

**Tables** reads the live schema of the selected connection: tables and views with row count / size, columns, indexes and paginated rows (sortable, CSV export of the current page). Actions that change data or structure (New Table, Add Column, Drop, Optimize…) open the **SQL Editor** with a ready-made statement — nothing is executed until you press Run.

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

The frontend dev server proxies `/api` requests to `http://localhost:3002` automatically.

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
