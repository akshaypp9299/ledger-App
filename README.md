# SocietyOS - Shivranjan Towers (MVP)

Society back-office app: flats, maintenance collection, cashbook, vendors, tenant agreements, attendance, notices, documents.

- `web/` - React + TypeScript + Vite
- `api/` - Spring Boot 4 (Java 21), plain SQL via JdbcClient, Flyway migrations, JWT login

## Run locally

```bash
# 1) API on :8080 (in-memory H2 unless DB_URL is set; data resets on restart)
cd api
SEED_PASSWORD='choose-a-password' ./mvnw spring-boot:run

# 2) Web on :5173 (proxies /api to :8080)
cd web
npm install
npm run dev
```

Seeded users (all share `SEED_PASSWORD`; if unset a random one is printed in the API log):
`admin@shivranjan.local`, `manager@shivranjan.local`, `viewer@shivranjan.local`

Roles: **Admin** everything + users/deletes, **Manager** enter/edit/export, **Viewer** read-only.

## Move to a real Postgres (Supabase or any cloud)

The schema is plain PostgreSQL. Set three variables and restart; Flyway creates the tables:

```
DB_URL=jdbc:postgresql://HOST:5432/postgres?sslmode=require
DB_USER=...
DB_PASSWORD=...
JWT_SECRET=<at least 32 random characters>
SEED_PASSWORD=<first-run password>
STORAGE_DIR=<persistent folder for uploaded files>
CORS_ORIGINS=https://your-web-origin
```

Uploaded files go through the `FileStorage` interface (`api/.../document/`); the MVP stores them on local disk.
Swap in an S3 / R2 implementation before deploying anywhere with an ephemeral disk.

## Tests

```bash
cd api && ./mvnw test      # auth, roles, tenant isolation, ledger and receipt invariants
cd web && npm run build    # type-check + production build
```
