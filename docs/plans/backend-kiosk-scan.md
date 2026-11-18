# Backend plan: kiosk scan

Status: draft, awaiting user approval. Author: backend-planner, 2026-11-18.

## 1. Goal

Everything the server must provide so the scanner screen at `/` works:
- `POST /api/scan` (record attendance, assign the day's queue number, enforce the cooldown)
- `GET /api/attendance/today` (today's log)
- the kiosk page's settings, read by a Server Component without an endpoint

It also lays the foundation that later plans build on: env config, the mysql2 + Drizzle client, the Drizzle schema for the legacy tables plus a new `settings` table, migrations, the APP_TIMEZONE time helper, the settings service, the test runner and a throwaway test database.

Serves `docs/PLAN.md` step 3 (backend foundation: Drizzle, mysql2, `settings`, env, contracts) and the backend half of step 4 (scan service with tests). Step 3's `admins` table, login/logout, sessions and the `/admin` guard are **out of scope** and get their own plan. The `settings` table is designed so the admin settings page can add rows and endpoints later without a schema change.

Behavior reference: `docs/research/backend-scan-flow.md` (the old `POST /api/scan`, `server.js:539-628`).

## 2. Decisions (check these before approving)

| # | Decision | Why |
|---|---|---|
| D1 | **Every failure returns a contract body.** Business outcomes: `success` 200, `duplicate` 429, `failed` 404. Errors: `{status:"error", code, message}` with 400 `invalid_request`, 500 `server_error`, 503 `db_unavailable`, 503 `busy`. The handler validates its own output against `scanResponseSchema` before sending. | Old 500 was `{error}` with no `status`, which rendered an empty card. |
| D2 | **Queue increment is one statement with a bound date:** `INSERT … VALUES (?, 1) ON DUPLICATE KEY UPDATE last_number = last_number + 1`, then `SELECT … FOR UPDATE` of the same date. `today` is computed once in Node. | Removes both midnight races: no `CURDATE()` evaluated twice, and the scan time and queue date come from the same instant. Concurrent first-of-day scans are safe on the primary key. No reliance on `LAST_INSERT_ID` semantics in the driver. |
| D3 | **Cooldown: default 180 min from `settings.cooldown_minutes`, measured from the employee's most recent scan of any date, keyed by `user_id`.** A scan is accepted when `now >= last + cooldown` (same as old strict `ago < cooldown` → duplicate). Allowed range 1–1440; there is no "off". | Keeps the old behavior; cross-midnight blocking (23:00 then 00:30) is intended, since shifts cross midnight. `README.md` says 10 min but the live code says 180; PLAN.md chose 180. |
| D4 | **Time comes from Node in APP_TIMEZONE.** `now` is formatted as `YYYY-MM-DD HH:MM:SS` wall-clock in APP_TIMEZONE and bound as a string. No `NOW()`, `CURDATE()`, `CURRENT_TIMESTAMP` or `TIMESTAMPDIFF(…, NOW())` in app SQL (a test greps for them). Cooldown math is naive wall-clock seconds in Node, same as `TIMESTAMPDIFF` on two `DATETIME`s. **The MySQL session `time_zone` is not set.** mysql2 runs with `dateStrings: true`; JS `Date` objects are never bound as parameters. | `DATETIME` is not affected by session `time_zone`, so setting it gains nothing for scans. Setting it would change how the old `TIMESTAMP` column `users.created_at` reads compared to the old app, and named zones need tz tables that XAMPP usually lacks. Existing rows are untouched. |
| D5 | **Employee ID matching uses the column's own collation, exactly like the old query** (`WHERE employee_id = ?`, no `COLLATE`, no case folding). Input is trimmed (JS `trim()`), then empty or longer than 50 → `failed` without a query. | The printed QR holds the exact stored `employee_id`, so an exact match succeeds under every collation; whatever extra matching the old database allowed (case-insensitive under `_ci`) stays identical because the predicate is identical. Forcing a `COLLATE` would error on a latin1 column and bypass the unique index. |
| D6 | **Isolation set explicitly per scan transaction:** `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ` before `START TRANSACTION`, and `SET SESSION innodb_lock_wait_timeout = 2`. The cooldown read is the **first consistent read** and runs only after the user row lock is held. Settings are read **before** the transaction. One retry on deadlock (1213), only if less than 2 s have passed; lock-wait timeout (1205) → 503 `busy`. Worst case stays well under the kiosk's 10 s client timeout (budget in 5.6). | Correct no matter what the server default is. Under RR the snapshot is created at the first consistent read, which is after the lock, so a concurrent same-employee scan's committed row is visible. Under SERIALIZABLE the plain read would take gap locks and could deadlock against another scan's insert; forcing RR avoids that. READ COMMITTED was rejected because it fails on servers with statement-based binlog. |
| D7 | **Unknown IDs never open a transaction.** A plain `SELECT id FROM users WHERE employee_id = ?` runs first; only a hit starts the transaction and locks the row **by primary key**. | Old code took `FOR UPDATE` on a missing unique key, which leaves a gap lock that can block an admin inserting a new employee. Behavior is identical otherwise. |
| D8 | **Scan transaction uses raw parameterized mysql2 on one pooled connection;** everything else (today's log, settings, migrations) uses Drizzle. | The scan's statement order, isolation, lock and error codes must be exact and reviewable against the old SQL. Raw mysql2 has no version-dependent API surface (Drizzle's transaction config and error wrapping vary by version). Both are allowed by the implementer rules. |
| D9 | **Schema source: hand-written Drizzle schema** from `../mbmc-qras/schema.sql` plus the boot-time upgrades, with a baseline migration that uses `CREATE TABLE IF NOT EXISTS` for the three legacy tables. `drizzle-kit pull` against a copy of production comes later as a verification step (section 9, Q1). A preflight check refuses to migrate a database whose legacy tables don't match. | No initialized production copy is available now. `IF NOT EXISTS` makes the baseline a no-op on the existing database and a correct fresh install on an empty one. |
| D10 | **Tests: Vitest.** Unit tests for pure code; integration tests against a real throwaway **MariaDB** started from the local `mariadbd` binary on port 3307 (no root, no Docker). Commands in section 7. | The scan's correctness is about locks and SQL, which mocks can't show. Docker isn't installed; MariaDB 13.0.2 is. |
| D11 | **Never cached or prerendered.** Both Route Handlers call `await connection()` from `next/server` before touching the database and send `Cache-Control: no-store`. Node's HTTP server adds the standard `Date` header to every response (the kiosk clock reads it); nothing disables it. The kiosk page's Server Component calls `await connection()` itself (UI plan, `kiosk-data.tsx`) and then the services directly. Services never call `connection()` (so tests can call them). Pool and env are created lazily, so `next build` never touches MySQL. No `export const dynamic` (removed under `cacheComponents`). | `cacheComponents` prerenders GET handlers that don't touch request data; a DB query would be issued at build time otherwise. |
| D12 | **`GET /api/attendance/today` takes no `date` parameter;** the server decides today. Response is an object `{date, timezone, generated_at, entries}` instead of a bare array. | Fixes the UTC default and the browser-clock date. A public endpoint that accepts any date exposed the whole history without login; the admin `GET /api/attendance?date=` replaces that use. |
| D13 | **Kiosk settings reach the kiosk on page load only.** Changes made on the admin page apply after the kiosk reloads. Cooldown is read per scan, so it applies immediately. Ticket options are the three booleans the UI plan asked for (`show_logo`, `show_org_name`, `show_scan_time`, default off = the old ticket), stored as `ticket_show_*` rows and delivered under `KioskSettings.ticket`. | Avoids a polling endpoint. No ticket option exists that the UI can't render. |
| D14 | **Field renames** in the scan response (section 4 table): `user` → `employee` (plus `full_name`), duplicate `scanned_at` → `last_scanned_at` (plus `cooldown_ends_at`, `retry_after_minutes`), success gains `queue_date`. | The UI is new anyway; the old duplicate `scanned_at` meant "the earlier scan", which confused the old card. |
| D15 | **New env var `DB_PORT`** (default 3306). Old variables keep their meaning, including old `||` semantics: an empty value means "use the default". | Needed for the test DB on 3307; harmless for existing `.env` files. |
| D16 | `next.config.ts` gets `serverExternalPackages: ["mysql2"]`. | mysql2 is not in Next's default external list (checked `node_modules/next/dist/lib/server-external-packages.jsonc`); loading it with Node's `require` avoids bundling its dynamic requires. The standalone trace still copies it. |

## 3. Schema changes

### 3.1 Legacy tables (unchanged, described in Drizzle)

Post-upgrade shape from `schema.sql` plus `server.js:765-849`. The old app names the unnamed indexes itself: unique index `employee_id`, composite index `user_id`, foreign key `attendance_ibfk_1`. The Drizzle schema declares those names so later diffs and `pull` comparisons don't see renames.

Nullability that varies between databases:
- `attendance.employee_id` and `attendance.name` are `NOT NULL` when created from `schema.sql`, but **nullable** when added by the boot upgrade (`server.js:778-779`). Declare them nullable in Drizzle; the services coalesce `NULL` to `""`.
- `users.created_at` is `TIMESTAMP DEFAULT CURRENT_TIMESTAMP`; its nullability depends on `explicit_defaults_for_timestamp`. Declare it without `notNull()`. The app never writes it.

`src/server/db/schema.ts` (all date columns in `mode: "string"`; never `mode: "date"`):

```ts
import { mysqlTable, int, varchar, datetime, date, timestamp, text, index, foreignKey, primaryKey } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: varchar("employee_id", { length: 50 }).notNull().unique("employee_id"),
  firstName: varchar("first_name", { length: 120 }).notNull(),
  lastName: varchar("last_name", { length: 120 }).notNull(),
  position: varchar("position", { length: 100 }).notNull(),
  photoFilename: varchar("photo_filename", { length: 100 }),
  email: varchar("email", { length: 120 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow(),
});

export const attendance = mysqlTable("attendance", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  employeeId: varchar("employee_id", { length: 50 }),
  name: varchar("name", { length: 241 }),
  position: varchar("position", { length: 100 }).notNull(),
  queueNumber: int("queue_number").notNull(),
  scannedAt: datetime("scanned_at", { mode: "string" }).notNull(),
}, (t) => [
  index("user_id").on(t.userId, t.scannedAt),
  foreignKey({ name: "attendance_ibfk_1", columns: [t.userId], foreignColumns: [users.id] }).onDelete("cascade"),
]);

export const dailyQueue = mysqlTable("daily_queue", {
  queueDate: date("queue_date", { mode: "string" }).primaryKey(),
  lastNumber: int("last_number").notNull(),
});
```

If the installed Drizzle version spells any of these builders differently, keep the SQL types, names and nullability above and adapt the syntax.

### 3.2 New table `settings`

```ts
export const settings = mysqlTable("settings", {
  settingKey: varchar("setting_key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),          // JSON-encoded value, e.g. 180, true, "MBMC"
  updatedAt: datetime("updated_at", { mode: "string" }).notNull(), // APP_TIMEZONE wall clock, written by Node
});
```

- Column is `setting_key`, not `key` (PLAN.md wording), because `KEY` is a reserved word in MySQL and raw SQL would need backticks everywhere.
- One row per key in `SETTING_KEYS` (`src/lib/contracts/settings.ts`). **No seed rows:** a missing row means "use `SETTINGS_DEFAULTS`". The kiosk plan never writes settings; the admin plan adds the writer (and can add an `updated_by` column additively).
- Value parsing: `JSON.parse(value)` then `settingsSchema.shape[key].safeParse`. Any failure → default for that key plus one `console.warn` per key per process.

### 3.3 Migrations

`drizzle/` managed by drizzle-kit, `dialect: "mysql"`. The migrator also creates its bookkeeping table `__drizzle_migrations` (additive).

1. **`drizzle/0000_legacy_baseline.sql`.** Run `drizzle-kit generate --name legacy_baseline` with only the three legacy tables in the schema. Keep the generated `meta/` snapshot. **Replace the SQL body** with exactly this (generated FK `ALTER TABLE` statements must not survive: on an existing database they would add a second foreign key):

   ```sql
   CREATE TABLE IF NOT EXISTS users (
     id INT AUTO_INCREMENT PRIMARY KEY,
     employee_id VARCHAR(50) NOT NULL UNIQUE,
     first_name VARCHAR(120) NOT NULL,
     last_name VARCHAR(120) NOT NULL,
     position VARCHAR(100) NOT NULL,
     photo_filename VARCHAR(100) NULL,
     email VARCHAR(120) NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   --> statement-breakpoint
   CREATE TABLE IF NOT EXISTS attendance (
     id INT AUTO_INCREMENT PRIMARY KEY,
     user_id INT NOT NULL,
     employee_id VARCHAR(50) NOT NULL,
     name VARCHAR(241) NOT NULL,
     position VARCHAR(100) NOT NULL,
     queue_number INT NOT NULL,
     scanned_at DATETIME NOT NULL,
     INDEX (user_id, scanned_at),
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
   );
   --> statement-breakpoint
   CREATE TABLE IF NOT EXISTS daily_queue (
     queue_date DATE PRIMARY KEY,
     last_number INT NOT NULL
   );
   ```
   This is `schema.sql` verbatim minus `CREATE DATABASE`/`USE`. No charset or collation clauses, same as the old app.

2. **`drizzle/0001_settings.sql`.** Add `settings` to the schema and run `drizzle-kit generate --name settings`. Keep the generated `CREATE TABLE` but change it to `CREATE TABLE IF NOT EXISTS`. No other statements.

Why this is additive and compatible with the existing `qr_attendance`:
- 0000 is a no-op on any database where the tables exist. It never alters a column.
- 0001 only creates a new table.
- No migration touches `users`, `attendance` or `daily_queue` rows or definitions. No index is added (an `attendance(scanned_at)` index would help the date range query; leave it to the admin plan if needed).
- The old app can still run against the same database afterwards: it ignores `settings` and `__drizzle_migrations`, and its own boot upgrades are no-ops on an already-upgraded schema.

### 3.4 Preflight check (`src/server/db/legacy-check.ts`)

`checkLegacySchema(conn, dbName): Promise<string[]>` returns a list of human-readable problems; empty means OK. It reads `INFORMATION_SCHEMA.COLUMNS` for the three legacy tables **only if they exist** (an empty database passes: 0000 will create them) and reports:
- a missing column from section 3.1 (e.g. `attendance.queue_number` missing: the DB was never upgraded by the working-tree old app);
- `attendance.queue_number`, `attendance.position`, `users.first_name`, `users.last_name`, `users.position` nullable (upgrade incomplete);
- any extra column in `attendance` or `users` that is `NOT NULL`, has no default and is not `auto_increment` (e.g. HEAD's `department`), because our inserts would fail.

`scripts/migrate.ts` runs it before migrating and exits 1 with the problems and the hint "Start the old mbmc-qras app once to finish its schema upgrade, then retry." It changes nothing.

## 4. Endpoints and contracts

Contract files (written, client-safe, zod 4):
- `src/lib/contracts/common.ts`: `localDateSchema`, `localDateTimeSchema`, `parseLocalDateTime`, `apiErrorSchema`, `ApiErrorCode`, `API_ERROR_HTTP_STATUS`, `API_ERROR_MESSAGES`
- `src/lib/contracts/scan.ts`: `scanRequestSchema`, `scanResponseSchema` (discriminated on `status`), `scanSuccessSchema`, `scanDuplicateSchema`, `scanFailedSchema`, `scanEmployeeSchema`, message constants, `formatDuplicateMessage`, `SCAN_OUTCOME_HTTP_STATUS`, `EMPLOYEE_ID_MAX_LENGTH`, `SCAN_CODE_MAX_LENGTH`, types `ScanRequest`, `ScanResponse`, `ScanOutcome`, `ScanSuccess`, `ScanDuplicate`, `ScanFailed`, `ScanEmployee`, `ScanStatus`
- `src/lib/contracts/attendance.ts`: `attendanceEntrySchema`, `todayAttendanceResponseSchema`, types
- `src/lib/contracts/settings.ts`: `settingsSchema`, `SETTINGS_DEFAULTS`, `SETTING_KEYS`, `ticketOptionsSchema`, `kioskSettingsSchema`, `toKioskSettings`, types `Settings`, `SettingKey`, `TicketOptions`, `KioskSettings`

### 4.1 `POST /api/scan`

- File: `src/app/api/scan/route.ts`. Auth: none (public, as before). Body: JSON `ScanRequest`.
- Request headers: content type is not checked; the body text is parsed as JSON regardless.
- Response headers: `Content-Type: application/json`, `Cache-Control: no-store`.
- Service: `scanEmployee(rawCode, options?)` in `src/server/services/scan.ts`. Handler logic: `handleScanRequest(request)` in `src/server/http/scan-handler.ts`.

| HTTP | Body | When |
|---|---|---|
| 200 | `ScanSuccess`, message `Attendance recorded.` | Recorded |
| 429 | `ScanDuplicate`, message `Duplicate scan. Already recorded — try again in N min.` | Inside cooldown |
| 404 | `ScanFailed`, message `QR code not recognized. Ask your admin to register you.` | Unknown, empty (after trim) or longer than 50 characters |
| 400 | `ApiError` `invalid_request` | Body over 4096 bytes, not JSON, not an object, `code` missing or not a string, `code` over 1024 characters |
| 503 | `ApiError` `db_unavailable` | Database unreachable, access denied, unknown database, too many connections |
| 503 | `ApiError` `busy` | Lock wait timeout, or deadlock twice |
| 500 | `ApiError` `server_error` | Anything else, including our own response failing `scanResponseSchema` |

Error messages come from `API_ERROR_MESSAGES`. Internal error text is never sent; it is logged with `console.error("[scan]", err)`.

Old → new field map:

| Old | New | Note |
|---|---|---|
| `user` | `employee` | Same four fields |
| — | `employee.full_name` | Same text as `attendance.name`; what the ticket prints |
| `queue_number` | `queue_number` | |
| — | `queue_date` | New, success only |
| `scanned_at` (success) | `scanned_at` | Now exactly the stored value |
| `scanned_at` (duplicate) | `last_scanned_at` | Renamed: it was always the earlier scan |
| — | `cooldown_ends_at`, `retry_after_minutes` | New, duplicate only |
| `{error:"Server error."}` (500) | `{status:"error", code, message}` | 400/500/503 |
| 400 HTML from body-parser | 400 `invalid_request` JSON | |
| `{}` body → 404 `failed` | `{}` body → 400 `invalid_request` | `code` is required now |

### 4.2 `GET /api/attendance/today`

- File: `src/app/api/attendance/today/route.ts`. Auth: none (public, as before; it returns names, IDs and positions of today's scans only). Query: none; any query string is ignored (old `?date=` included).
- 200 → `TodayAttendanceResponse`. Errors → `ApiError` with 503 `db_unavailable` or 500 `server_error`. Headers as in 4.1, plus the standard `Date` header (added by Node's HTTP server; the implementer verifies it with curl and must not strip it).
- Service: `getTodayAttendance(options?)` in `src/server/services/attendance.ts`. Handler: `handleTodayAttendanceRequest()` in `src/server/http/attendance-today-handler.ts`.
- Old → new: bare array → `{date, timezone, generated_at, entries}`; entry fields unchanged (`id, employee_id, name, position, queue_number, scanned_at`).

### 4.3 Kiosk page data (no endpoint)

The kiosk Server Component (UI plan: `src/app/(kiosk)/kiosk-data.tsx`) calls `await connection()` first, inside `<Suspense>`, then these services directly:

| Function | Import path | Returns | When the database is down |
|---|---|---|---|
| `getKioskSettings(): Promise<KioskSettings>` | `@/server/services/settings` | `org_name`, `camera_enabled`, `ticket.{show_logo, show_org_name, show_scan_time}`, `timezone` (APP_TIMEZONE) | **Rejects** with the driver error (mysql2 `code` such as `ECONNREFUSED`, `ER_ACCESS_DENIED_ERROR`, `ER_BAD_DB_ERROR`; possibly wrapped by Drizzle in `.cause`). A missing `settings` table or invalid stored values do **not** throw: defaults are used for those keys. |
| `getDefaultKioskSettings(): KioskSettings` | `@/server/services/settings` | `toKioskSettings(SETTINGS_DEFAULTS, APP_TIMEZONE)`. Synchronous, never touches the DB. | Never throws for DB reasons. Throws only if `APP_TIMEZONE` is invalid (a deployment error the page should not hide). Use it in the page's `catch`. |
| `getTodayAttendance(): Promise<TodayAttendanceResponse>` | `@/server/services/attendance` | Same object as `GET /api/attendance/today` | **Rejects** with the driver error, as above. The page catches and passes `initialLog: null`. |

- The page should catch **any** rejection, log it, and fall back (`getDefaultKioskSettings()`, `initialLog: null`). It doesn't need to inspect the error. With the DB on localhost, `ECONNREFUSED` is immediate; an unreachable remote host fails after the 2 s `connectTimeout`.
- No `"use cache"`: one read per page load is cheap, and caching would need invalidation from the admin plan.
- Services never call `connection()` themselves; that is the caller's job (Route Handler or Server Component).

## 5. Service logic

### 5.1 Env (`src/server/env.ts`)

`getEnv()` parses `process.env` with zod on first call and memoizes. Nothing reads env at import time.

| Var | Default | Rule |
|---|---|---|
| `DB_HOST` | `localhost` | empty → default |
| `DB_PORT` | `3306` | new; integer 1–65535 |
| `DB_USER` | `root` | empty → default |
| `DB_PASS` | `""` | |
| `DB_NAME` | `qr_attendance` | empty → default |
| `APP_TIMEZONE` | `Asia/Manila` | empty → default; must be accepted by `new Intl.DateTimeFormat("en-US", { timeZone })`, else throw `Invalid APP_TIMEZONE "<value>"` |

`PORT` is read by Next itself; `ADMIN_PASSWORD`, `SESSION_SECRET`, `UPLOADS_DIR` belong to later plans and are not parsed here. Export `resetEnvForTests()` (clears the memo). Add `DB_PORT=3306` to `.env.example`.

### 5.2 Time (`src/server/time.ts`)

Pure functions plus thin env-reading wrappers:
- `toLocalDateTime(instant: Date, timeZone: string): LocalDateTime` via a cached `Intl.DateTimeFormat("en-US", { timeZone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23" })` and `formatToParts` (never `toLocaleString` parsing; `hourCycle: "h23"` avoids `24:00:00`).
- `localDateOf(dt: LocalDateTime): LocalDate` → first 10 chars.
- `addDays(date: LocalDate, days: number): LocalDate`.
- `wallClockSeconds(dt: LocalDateTime): number` → `Date.UTC(y, m-1, d, h, mi, s) / 1000` (naive; no zone).
- `addSecondsLocal(dt: LocalDateTime, seconds: number): LocalDateTime` → inverse of the above.
- `nowLocal(instant = new Date()): LocalDateTime` → `toLocalDateTime(instant, getEnv().APP_TIMEZONE)`.

Node's official builds (and the bundled `node.exe`) ship full ICU, so IANA zones work offline.

### 5.3 DB client (`src/server/db/client.ts`)

- `getPool()`: lazy singleton stored on `globalThis` (survives dev HMR). `mysql2/promise` `createPool({ host, port, user, password, database, dateStrings: true, connectionLimit: 10, waitForConnections: true, queueLimit: 0, connectTimeout: 2000 })`. No `timezone` option (irrelevant with `dateStrings` and string params). No `multipleStatements`.
- `getDb()`: `drizzle(...)` over that pool with `schema` and `mode: "default"`.
- `closePool()`: ends the pool and clears the global (tests, scripts).

### 5.4 DB errors (`src/server/db/errors.ts`)

`classifyDbError(err): "db_unavailable" | "busy" | "deadlock" | "missing_table" | "other"`. Walk `err`, `err.cause`, `err.cause.cause` (Drizzle wraps driver errors) and read the mysql2 `code`:
- `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, `EHOSTUNREACH`, `ECONNRESET`, `PROTOCOL_CONNECTION_LOST`, `ER_ACCESS_DENIED_ERROR`, `ER_BAD_DB_ERROR`, `ER_CON_COUNT_ERROR`, `ER_DBACCESS_DENIED_ERROR` → `db_unavailable`
- `ER_LOCK_WAIT_TIMEOUT` (1205) → `busy`
- `ER_LOCK_DEADLOCK` (1213) → `deadlock`
- `ER_NO_SUCH_TABLE` (1146) → `missing_table`
- else `other`

`toApiErrorCode(kind)`: `db_unavailable` → `db_unavailable`; `busy`, `deadlock` → `busy`; else `server_error`.

### 5.5 Settings (`src/server/services/settings.ts`)

- `mergeSettings(rows: { settingKey: string; value: string }[]): Settings`: pure; JSON-parse and validate each known key, default otherwise, ignore unknown keys. Exported for the unit test.
- `getSettings(): Promise<Settings>`: Drizzle `select settingKey, value from settings where settingKey in SETTING_KEYS`, then `mergeSettings`. `missing_table` → `SETTINGS_DEFAULTS` (warn once). Other errors propagate.
- `getCooldownMinutes(): Promise<number>` → `(await getSettings()).cooldown_minutes`.
- `getKioskSettings(): Promise<KioskSettings>` → `toKioskSettings(await getSettings(), getEnv().APP_TIMEZONE)`. Rejects when the DB is unreachable (4.3).
- `getDefaultKioskSettings(): KioskSettings` → `toKioskSettings(SETTINGS_DEFAULTS, getEnv().APP_TIMEZONE)`.

### 5.6 Scan (`src/server/services/scan.ts`)

```ts
export async function scanEmployee(
  rawCode: string,
  options?: { now?: () => Date; lockWaitTimeoutSeconds?: number },  // test hooks; defaults new Date() and 2
): Promise<ScanOutcome>
```
Throws on infrastructure errors; returns the three business outcomes.

Steps:
1. `code = rawCode.trim()`. If `code === ""` or `code.length > EMPLOYEE_ID_MAX_LENGTH` → return `failed`.
2. `cooldownMinutes = await getCooldownMinutes()` (pool, **outside** the transaction, so it can't start the snapshot early).
3. **R0** (pool, autocommit): `SELECT id FROM users WHERE employee_id = ? LIMIT 1` [code]. No row → return `failed`.
4. Record `startedAt = Date.now()`. Get a dedicated connection: `conn = await getPool().getConnection()`. Then `attempt` loop, max 2 attempts, retrying only when the transaction failed with `deadlock` **and** `Date.now() - startedAt < 2000`:
   1. **S1** `SET SESSION innodb_lock_wait_timeout = ?` [lockWaitTimeoutSeconds]
   2. **S2** `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`
   3. **S3** `START TRANSACTION`
   4. **R1** `SELECT id, employee_id, first_name, last_name, position FROM users WHERE id = ? FOR UPDATE` [R0.id]. No row (deleted since R0) → `ROLLBACK`, return `failed`.
   5. `now = toLocalDateTime(options.now?.() ?? new Date(), tz)`; `today = localDateOf(now)`. Captured **after** the lock, so a scan that waited is judged at the time it got through.
   6. **R2** `SELECT scanned_at FROM attendance WHERE user_id = ? ORDER BY scanned_at DESC LIMIT 1` [user.id]. First consistent read of the transaction.
   7. If R2 has a row: `endsAt = addSecondsLocal(last, cooldownMinutes * 60)`. If `wallClockSeconds(now) < wallClockSeconds(endsAt)` → `ROLLBACK`, return `duplicate` with `last_scanned_at = last`, `cooldown_ends_at = endsAt`, `retry_after_minutes = max(1, ceil((endsAt - now) / 60))`, message `formatDuplicateMessage(retry_after_minutes)`. A last scan in the future (clock went back, or old rows written in another zone) is therefore a duplicate until `last + cooldown`, as in the old app.
   8. **W1** `INSERT INTO daily_queue (queue_date, last_number) VALUES (?, 1) ON DUPLICATE KEY UPDATE last_number = last_number + 1` [today]
   9. **R3** `SELECT last_number FROM daily_queue WHERE queue_date = ? FOR UPDATE` [today] → `queueNumber`. Current read of a row this transaction already holds X-locked, so it is our own value. Missing row is impossible; if it happens, throw (→ 500).
   10. **W2** `INSERT INTO attendance (user_id, employee_id, name, position, queue_number, scanned_at) VALUES (?, ?, ?, ?, ?, ?)` [user.id, user.employee_id, fullName, user.position, queueNumber, now], where `fullName = \`${first_name} ${last_name}\`.trim()`.
   11. **C** `COMMIT`
   12. Return `success`: `employee` from R1 (stored `employee_id`, not the scanned text), `full_name = fullName`, `queue_number`, `queue_date = today`, `scanned_at = now`, message `SCAN_SUCCESS_MESSAGE`.
   - On any error inside: `ROLLBACK` (ignore a rollback error), then if `classifyDbError(err) === "deadlock"`, this was attempt 1 and less than 2 s have passed, loop; else rethrow.
   - `finally`: `conn.release()`. If the error was a connection-level one (`db_unavailable`), call `conn.destroy()` instead of `release()`.

Locks and ordering: every accepted scan takes `users` row (by PK) → `daily_queue` row, in that order, so there is no lock cycle. Same-employee scans serialize on the `users` row; all accepted scans serialize on today's `daily_queue` row until commit, which keeps numbers gap-free (a failed scan rolls its increment back). Time budget against the kiosk's 10 s client timeout (UI plan section 11.6):
- `innodb_lock_wait_timeout = 2` applies per locking statement. Only R1 (`users` row) and W1/R3 (`daily_queue` row, already held after W1) can wait, so one attempt waits at most about 4 s.
- A deadlock retry happens only within the first 2 s, so a retried scan still finishes within about 6 s.
- `connectTimeout: 2000` caps a dead remote DB at 2 s; on localhost a stopped server refuses at once.
- In normal use each scan holds the `daily_queue` lock for a few milliseconds, so these limits only matter when something else is holding locks (an admin bulk job, a stuck session).
- If the client aborts, the server transaction may still commit; the scan is then recorded without a printed ticket, and the admin reprint covers it.

### 5.7 Scan handler (`src/server/http/scan-handler.ts`)

`handleScanRequest(request: Request): Promise<Response>`:
1. `text = await request.text()`. If `Buffer.byteLength(text) > 4096` → 400 `invalid_request`.
2. `JSON.parse(text)` in try/catch → 400 on failure.
3. `scanRequestSchema.safeParse(json)` → 400 on failure.
4. `outcome = await scanEmployee(parsed.code)`; on throw → `toApiErrorCode(classifyDbError(err))`, log, error response.
5. `body = scanResponseSchema.parse(outcome)`; status from `SCAN_OUTCOME_HTTP_STATUS`. If the parse throws → log, 500 `server_error`.

Shared helpers in `src/server/http/responses.ts`: `json(body, status)` (sets `Cache-Control: no-store`) and `apiError(code)` (builds `{status:"error", code, message: API_ERROR_MESSAGES[code]}` with `API_ERROR_HTTP_STATUS[code]`).

`src/app/api/scan/route.ts`:
```ts
import { connection } from "next/server";
import { handleScanRequest } from "@/server/http/scan-handler";
export async function POST(request: Request) {
  await connection();
  return handleScanRequest(request);
}
```

### 5.8 Today's log (`src/server/services/attendance.ts`)

`getTodayAttendance(options?: { now?: () => Date }): Promise<TodayAttendanceResponse>`:
1. `now = nowLocal(...)`, `date = localDateOf(now)`, `next = addDays(date, 1)`.
2. Drizzle: `SELECT id, employee_id, name, position, queue_number, scanned_at FROM attendance WHERE scanned_at >= ? AND scanned_at < ? ORDER BY scanned_at DESC, id DESC` [`${date} 00:00:00`, `${next} 00:00:00`]. Same rows as the old `DATE(scanned_at) = ?`. No limit.
3. Map `NULL` `employee_id`/`name` → `""`. Return `{ date, timezone, generated_at: now, entries }`.

Handler `handleTodayAttendanceRequest()` validates with `todayAttendanceResponseSchema.parse`, maps errors like 5.7 step 4. Route `GET` = `await connection(); return handleTodayAttendanceRequest();`.

## 6. Files

| File | Purpose |
|---|---|
| `package.json` | deps: `drizzle-orm`, `mysql2`, `zod` (direct, `^4.6`), `server-only`. devDeps: `drizzle-kit`, `vitest`, `vite-tsconfig-paths`, `tsx`. Latest stable versions (no betas), exact versions recorded in the report. Scripts in section 7. |
| `next.config.ts` | add `serverExternalPackages: ["mysql2"]` (D16) |
| `.env.example` | add `DB_PORT=3306` |
| `drizzle.config.ts` | `dialect: "mysql"`, `schema: "./src/server/db/schema.ts"`, `out: "./drizzle"`, credentials from `DB_*` (loaded with `loadEnvConfig` from `@next/env`) |
| `drizzle/0000_legacy_baseline.sql`, `drizzle/0001_settings.sql`, `drizzle/meta/*` | migrations (3.3) |
| `scripts/migrate.ts` | load env, connect, `checkLegacySchema`, then Drizzle `migrate()` from `drizzle-orm/mysql2/migrator`; exit 1 on problems |
| `scripts/test-db.sh` | `start` / `stop` / `status` for a throwaway MariaDB (7.2) |
| `src/server/env.ts` | 5.1 |
| `src/server/time.ts` | 5.2 |
| `src/server/db/schema.ts` | 3.1, 3.2 |
| `src/server/db/client.ts` | 5.3 |
| `src/server/db/errors.ts` | 5.4 |
| `src/server/db/legacy-check.ts` | 3.4 |
| `src/server/services/settings.ts` | 5.5 |
| `src/server/services/scan.ts` | 5.6 |
| `src/server/services/attendance.ts` | 5.8 |
| `src/server/http/responses.ts` | 5.7 helpers |
| `src/server/http/scan-handler.ts` | 5.7 |
| `src/server/http/attendance-today-handler.ts` | 5.8 |
| `src/app/api/scan/route.ts` | 5.7 |
| `src/app/api/attendance/today/route.ts` | 5.8 |
| `vitest.config.mts` | two projects (7.1) |
| `tests/stubs/server-only.ts` | empty module; `server-only` is aliased to it in Vitest |
| `tests/setup/db-env.ts` | maps `TEST_DB_*` to `DB_*`, sets `APP_TIMEZONE=Asia/Manila`, refuses names not matching `/_test(_[a-z0-9_]+)?$/` |
| `tests/global/db.ts` | Vitest `globalSetup` for the db project (7.2) |
| `tests/fixtures/legacy-schema.sql` | `schema.sql` minus `CREATE DATABASE`/`USE` |
| `tests/helpers/db.ts` | `resetData()`, `insertUser()`, `insertAttendance()`, `rawQuery()` |
| `tests/unit/*.test.ts`, `tests/db/*.test.ts` | section 8 |

Every file under `src/server/` starts with `import "server-only"`. Tests live in `tests/`, not under `src/server/`. Scripts run with `tsx --conditions=react-server` so `server-only` resolves to its empty export.

## 7. Tests: runner and database

### 7.1 Vitest

`vitest.config.mts`: `vite-tsconfig-paths` for `@/`; `resolve.alias: { "server-only": "./tests/stubs/server-only.ts" }`; environment `node`. Projects:
- `unit`: `tests/unit/**/*.test.ts`, no DB.
- `db`: `tests/db/**/*.test.ts`, `setupFiles: ["tests/setup/db-env.ts"]`, `globalSetup: ["tests/global/db.ts"]`, `fileParallelism: false`, `testTimeout: 30000`. Each file calls `closePool()` in `afterAll`.

### 7.2 Test database

Default: a throwaway MariaDB from the installed `mariadbd` (Arch `mariadb 13.0.2`), owned by the user, no sudo:
- `scripts/test-db.sh start`: dir `${TMPDIR:-/tmp}/mbmc-qrawb-test-db`; if no `data/`, run `mariadb-install-db --no-defaults --datadir=$DIR/data --auth-root-authentication-method=normal --skip-test-db`; start `mariadbd --no-defaults --datadir=$DIR/data --port=3307 --bind-address=127.0.0.1 --socket=$DIR/mysqld.sock --pid-file=$DIR/mysqld.pid` in the background; wait until `mariadb-admin --protocol=tcp -h127.0.0.1 -P3307 -uroot ping` succeeds (30 s max). Root over TCP with no password, like XAMPP.
- `scripts/test-db.sh stop`: `mariadb-admin … shutdown`. `status`: ping.
- Any other server works via env (`.env.test`, loaded by `loadEnvConfig` when `NODE_ENV=test`): `TEST_DB_HOST` (127.0.0.1), `TEST_DB_PORT` (3307), `TEST_DB_USER` (root), `TEST_DB_PASS` (""), `TEST_DB_NAME` (`qr_attendance_test`). On a Windows dev box, point these at XAMPP.

`tests/global/db.ts` (once per run): `DROP DATABASE IF EXISTS qr_attendance_test`, `CREATE DATABASE`, load `tests/fixtures/legacy-schema.sql`, run the migrator. Reset between tests (`resetData()`): `DELETE FROM attendance; DELETE FROM users; DELETE FROM daily_queue; DELETE FROM settings`. Migration tests use their own databases `qr_attendance_test_fresh` and `qr_attendance_test_legacy`, dropped and created inside the test.

### 7.3 Commands to add to CLAUDE.md

```
- `npm test`: unit tests (no database)
- `npm run test:db:start` / `npm run test:db:stop`: throwaway MariaDB on 127.0.0.1:3307
- `npm run test:db`: integration tests against TEST_DB_* (default: the throwaway server)
- `npm run db:generate`: drizzle-kit generate (after a schema change)
- `npm run db:migrate`: preflight check, then apply migrations to DB_* from .env
```
package.json scripts: `"test": "vitest run --project unit"`, `"test:db": "vitest run --project db"`, `"test:db:start": "bash scripts/test-db.sh start"`, `"test:db:stop": "bash scripts/test-db.sh stop"`, `"db:generate": "drizzle-kit generate"`, `"db:migrate": "tsx --conditions=react-server scripts/migrate.ts"`.

## 8. Tests the implementer must write

### Unit (`tests/unit/`)
- `time.test.ts`: `2026-11-18T16:00:00Z` → `2026-11-19 00:00:00` in Asia/Manila; `15:59:59Z` → `2026-11-18 23:59:59`; midnight hour is `00`, never `24`; `addDays` across month end and year end; `wallClockSeconds`/`addSecondsLocal` round-trip; `toLocalDateTime` with `UTC` differs from Manila by 8 h.
- `env.test.ts`: defaults when unset; empty `DB_HOST`/`DB_USER`/`DB_NAME`/`APP_TIMEZONE` → defaults; `DB_PASS=""` stays `""`; `DB_PORT` parsed; invalid `APP_TIMEZONE` throws with the value in the message.
- `db-errors.test.ts`: each code in 5.4 maps correctly, including when nested in `.cause` twice; unknown → `other`; `toApiErrorCode` mapping.
- `settings-parse.test.ts`: (pure merge function exported from the settings service) no rows → `SETTINGS_DEFAULTS`; invalid JSON, wrong type, out-of-range cooldown (0, 1441) → default for that key only; valid rows override.
- `contracts.test.ts`: sample `success`/`duplicate`/`failed`/`error` bodies parse with `scanResponseSchema`; an unknown `status` and a `success` without `queue_number` are rejected; `formatDuplicateMessage(3)` equals the old text with U+2014.
- `no-db-clock.test.ts`: no file under `src/server/` contains `NOW()`, `CURDATE()`, `CURRENT_TIMESTAMP` or `UTC_TIMESTAMP` (case-insensitive), and none passes `mode: "date"` to a column.

### Integration (`tests/db/`)
`scan.test.ts` (inject `now`):
1. First scan of the day → `success`, `queue_number` 1, `queue_date` today, `scanned_at` = injected time; `attendance` row has the snapshot `name` (`"First Last"`, trimmed when last name is empty), `position`, stored `employee_id`; `daily_queue` = 1.
2. Second employee → 2.
3. Unknown code → `failed`; no rows in `attendance`; `daily_queue` untouched.
4. `"  EMP-001\r\n"` → `success` for `EMP-001`. `""` and a 51-char code → `failed` with zero queries to `users` (spy on the pool or check general log not needed: assert `daily_queue` unchanged and no error).
5. Matching follows the column collation: insert `EMP-ABC`; result of scanning `emp-abc` is `success` iff `SELECT COUNT(*) FROM users WHERE employee_id = 'emp-abc'` is 1 on this server. Exact `EMP-ABC` always succeeds.
6. Inside cooldown (prior row 2 h ago, default 180) → `duplicate`, `last_scanned_at` = prior row, `cooldown_ends_at` = prior + 180 min, `retry_after_minutes` 60, message text; no new rows; `daily_queue` unchanged.
7. Exactly at `last + cooldown` → `success`; one second before → `duplicate` with `retry_after_minutes` 1.
8. Cross-midnight: prior `2026-11-18 23:00:00`, scan `2026-11-19 00:30:00` → `duplicate`.
9. `settings` row `cooldown_minutes` = `10`: prior 11 min ago → `success`. Row value `"abc"` → default 180 applies.
10. Day rollover: scans at `23:59:59` and next day `00:00:00` → second gets `queue_number` 1 and the new `queue_date`; previous day's `daily_queue` row unchanged.
11. Future last scan (prior row 1 h after `now`) → `duplicate`.
12. Concurrency, different employees: 25 users, `Promise.all` of 25 scans → all `success`, queue numbers exactly `{1..25}`, 25 rows, `daily_queue` = 25.
13. Concurrency, first scans of a new day with no `daily_queue` row: 10 parallel → `{1..10}`, no errors.
14. Concurrency, same employee: 10 parallel → exactly 1 `success`, 9 `duplicate`, 1 row.
15. Lock wait: a second connection holds `SELECT … FROM users WHERE id = ? FOR UPDATE` in an open transaction; `scanEmployee(code, { lockWaitTimeoutSeconds: 1 })` rejects with an error classified `busy`. The holder then rolls back and a retry succeeds.
16. Rollback leaves no gap: make W2 fail once (insert a user whose `position` exceeds 100 chars is not possible; instead drop `attendance`'s privilege is too heavy — use a `BEFORE INSERT` trigger on `attendance` that `SIGNAL`s when `employee_id = 'FAIL'`), scan `FAIL` → throws, `daily_queue` unchanged; next scan gets the next number with no gap. Drop the trigger after.

`attendance-today.test.ts`:
1. Rows at previous day `23:59:59`, today `00:00:00`, today `12:00:00`, next day `00:00:00` → only the two today rows, newest first, ties ordered by `id DESC`.
2. `date` and `generated_at` come from the injected `now` in Asia/Manila (e.g. `2026-11-18T16:30:00Z` → date `2026-11-19`).
3. A legacy row with `NULL` `employee_id`/`name` (alter a test copy to nullable first, as the boot upgrade does) → `""` in the output; output passes `todayAttendanceResponseSchema`.

`handlers.test.ts` (call `handleScanRequest(new Request(...))` and `handleTodayAttendanceRequest()` directly; check status, `Cache-Control: no-store` and that every body passes the contract schema):
1. Valid scan → 200 / 429 / 404 for success / duplicate / unknown.
2. Body `not json` → 400 `invalid_request`; `{}` → 400; `{"code": 123}` → 400; 5000-byte body → 400; `code` of 1025 chars → 400; 60-char `code` → 404 `failed`.
3. DB down: set `DB_PORT` to an unused port, `resetEnvForTests()`, `closePool()` → scan returns 503 `db_unavailable`; today returns 503 `db_unavailable`. Restore afterwards.
4. Settings table missing (drop it in this test; recreate after): scan still works with cooldown 180; `getKioskSettings()` resolves to `toKioskSettings(SETTINGS_DEFAULTS, "Asia/Manila")`.
5. Kiosk services with the DB down (same setup as 3): `getKioskSettings()` and `getTodayAttendance()` reject, and the rejection classifies as `db_unavailable`; `getDefaultKioskSettings()` still returns defaults with `timezone`. With rows `ticket_show_logo = true` and `org_name = "\"MBMC\""`, `getKioskSettings()` returns `ticket.show_logo: true`, `org_name: "MBMC"` and passes `kioskSettingsSchema`.

`migrations.test.ts`:
1. Fresh: empty `qr_attendance_test_fresh` → `checkLegacySchema` returns `[]`; migrate → all four tables exist; the legacy tables' `INFORMATION_SCHEMA.COLUMNS` (name, type, nullability) equal those created from `tests/fixtures/legacy-schema.sql`.
2. Legacy: create from the fixture, insert sample rows, capture `SHOW CREATE TABLE` for the three tables, migrate, migrate again → identical `SHOW CREATE TABLE` output, rows intact, exactly one foreign key on `attendance`, `settings` exists.
3. Preflight: fixture without `queue_number` → problem listed; fixture with `department VARCHAR(100) NOT NULL` on `attendance` → problem listed; `scripts/migrate.ts` logic exits non-zero (test the exported `runMigrations()` returning problems, not the process).

Not tested automatically: the deadlock retry path (no reliable way to force InnoDB deadlocks here). Cover `classifyDbError` and keep the retry loop small.

## 9. Acceptance checks

With the throwaway DB running and `.env` pointing `DB_*` at it (`DB_PORT=3307`, `DB_NAME=qr_attendance_dev`), `npm run db:migrate`, insert a user `EMP-001`, then `npm run dev`:

```bash
# success, then duplicate
curl -si -X POST http://localhost:3000/api/scan -H 'content-type: application/json' -d '{"code":"EMP-001"}'
#   -> 200, Cache-Control: no-store, {"status":"success",...,"queue_number":1,...}
curl -si -X POST http://localhost:3000/api/scan -H 'content-type: application/json' -d '{"code":"EMP-001"}'
#   -> 429, {"status":"duplicate",...,"retry_after_minutes":180}
# unknown, empty, malformed
curl -si -X POST http://localhost:3000/api/scan -H 'content-type: application/json' -d '{"code":"NOPE"}'   # 404 failed
curl -si -X POST http://localhost:3000/api/scan -H 'content-type: application/json' -d '{"code":"   "}'    # 404 failed
curl -si -X POST http://localhost:3000/api/scan -H 'content-type: application/json' -d 'nope'             # 400 error invalid_request
curl -si -X POST http://localhost:3000/api/scan -d '{"code":"EMP-001"}'                                   # no content type: still parsed
# today's log
curl -si http://localhost:3000/api/attendance/today            # 200, headers include Cache-Control: no-store AND a Date: header,
                                                                #   body {"date":"<Manila today>","timezone":"Asia/Manila",...}
curl -si 'http://localhost:3000/api/attendance/today?date=2020-01-01'   # same as above: param ignored
# DB down
npm run test:db:stop
curl -si -X POST http://localhost:3000/api/scan -H 'content-type: application/json' -d '{"code":"EMP-001"}'  # 503 db_unavailable
curl -si http://localhost:3000/api/attendance/today            # 503 db_unavailable
```

Plus:
- `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run test:db` all pass.
- `npm run build` **with the test DB stopped** succeeds, and the route table marks `/api/scan` and `/api/attendance/today` as dynamic (not prerendered).
- `grep -rn "import \"server-only\"" src/server | wc -l` equals the number of files under `src/server/`.

## 10. Implementation checklist (in order)

1. Install deps (section 6), add scripts, `serverExternalPackages`, `DB_PORT` in `.env.example`.
2. `src/server/env.ts`, `src/server/time.ts` + unit tests (`time`, `env`).
3. Vitest config, `server-only` stub, `npm test` green.
4. `scripts/test-db.sh`, start the throwaway DB.
5. `src/server/db/schema.ts`, `drizzle.config.ts`, generate and hand-edit `0000` and `0001` (3.3).
6. `src/server/db/client.ts`, `errors.ts`, `legacy-check.ts`, `scripts/migrate.ts`; db test setup files and fixture; `migrations.test.ts` green.
7. `src/server/services/settings.ts` + `settings-parse` test.
8. `src/server/services/scan.ts` + `scan.test.ts` green (all 16).
9. `src/server/services/attendance.ts` + `attendance-today.test.ts`.
10. `src/server/http/*`, both `route.ts` files; `handlers.test.ts`, `contracts.test.ts`, `no-db-clock.test.ts`.
11. Lint, type check, both test suites, build with DB stopped, curl checks (section 9).
12. Report: files, exact installed versions, results, anything settled, the CLAUDE.md command lines from 7.3 for the main session to add.

## 11. UI plan requirements (`docs/plans/ui-kiosk-scanner.md` sections 10–11)

| UI request | How this plan meets it |
|---|---|
| Today's log is an object with the server's `date` | `TodayAttendanceResponse` = `{date, timezone, generated_at, entries}` (4.2) |
| Named services for the page, with import paths and failure behavior | `getKioskSettings`, `getDefaultKioskSettings` from `@/server/services/settings`; `getTodayAttendance` from `@/server/services/attendance`; the first and last reject when the DB is down (4.3) |
| Ticket options `show_logo`, `show_org_name`, `show_scan_time`, default false | `KioskSettings.ticket`, stored as `ticket_show_*` (3.2, contract `settings.ts`) |
| Today's log `no-store` and with a `Date` header | D11, 4.2, acceptance in 9 |
| Every scan failure has a contract body with a displayable `message` | D1, 4.1, 5.7; messages from `API_ERROR_MESSAGES` |
| Scan finishes well inside 10 s | 2 s lock wait, 2 s connect timeout, gated retry (5.6) |

Contract names that differ from what the UI plan reads (the UI plan allowed "an obvious rename"; the ui-planner must update section 10 and the code that reads these):

| UI plan reads | Contract field |
|---|---|
| `user.employee_id`, `user.first_name`, `user.last_name`, `user.position` | `employee.employee_id`, `employee.first_name`, `employee.last_name`, `employee.position`, plus `employee.full_name` (the ticket name) |
| duplicate `scanned_at` ("Last scanned") | duplicate `last_scanned_at` (plus `cooldown_ends_at`, `retry_after_minutes`) |
| error `message` "when present" | always present on `status: "error"` |
| `getKioskSettings()` (path not given) | `getKioskSettings()` from `@/server/services/settings`, returns `KioskSettings` |
| ticket options at the top level | under `ticket` |
| scan code max length | `SCAN_CODE_MAX_LENGTH` = 1024 (UI's 64-char buffer cap is stricter, which is fine) |

`scanned_at`, `last_scanned_at` and `generated_at` are `"YYYY-MM-DD HH:MM:SS"` wall-clock text in APP_TIMEZONE, as in the old app; `parseLocalDateTime` in `@/lib/contracts/common` splits them without time zone math.

## 12. Open questions

For the backend-researcher (read-only, against a **copy** of the production database or the kiosk PC):
- Q1. What do `SELECT VERSION(), @@global.time_zone, @@system_time_zone, NOW(), UTC_TIMESTAMP(), @@global.tx_isolation, @@global.transaction_isolation, @@innodb_lock_wait_timeout, @@log_bin, @@binlog_format, @@explicit_defaults_for_timestamp` return? (Is MySQL's clock in Manila time, so existing `scanned_at` rows line up with the new APP_TIMEZONE stamps? Whichever of the two isolation variables exists is fine.)
- Q2. What do `SHOW CREATE TABLE users`, `SHOW CREATE TABLE attendance`, `SHOW CREATE TABLE daily_queue` and the `COLLATION_NAME` of `users.employee_id` show? Then run `drizzle-kit pull` against that copy and diff it with `src/server/db/schema.ts`.
- Q3. Are there `users.employee_id` values with leading or trailing whitespace (`SELECT employee_id FROM users WHERE employee_id <> TRIM(employee_id)`), or pairs that differ only by case? (Trimmed scans can't match the former; the old app had the same limit.)
- Q4. Which MariaDB/MySQL version does the kiosk's XAMPP ship? If it is 10.4–10.6, should the integration tests also run against that version (our local server is MariaDB 13.0.2)?
- Q5. Does the Next.js 16.4.6 standalone `server.js` load `.env` from its own directory at startup? (Decides how the packaging plan delivers `DB_*` and `APP_TIMEZONE`; not blocking here.)
- Q6. Current stable `drizzle-orm` / `drizzle-kit` versions: does the mysql2 migrator honor `--> statement-breakpoint` in a hand-edited file, and do query errors arrive wrapped (`DrizzleQueryError` with `.cause`)? The plan already handles both cases; this only confirms it.

For the user:
- U1. Cooldown 180 min, counted from the last scan of any date (so 23:00 then 00:30 is a duplicate). Keep? (README says 10.)
- U2. Remove `?date=` from the public today endpoint (admins get dated lists after login). OK?
- U3. Missing or non-string `code` now returns 400 `invalid_request` instead of 404 `failed`. Empty and unknown codes still return 404. OK?
- U4. Cooldown range 1–1440 min, no way to switch it off. OK?
- U5. Kiosk display and ticket settings apply when the kiosk page reloads, not live. OK, or should the scan response carry them?
- U6. Ticket options are only `show_logo`, `show_org_name`, `show_scan_time`, all off by default (the old ticket: number and name). There is no setting to turn auto-print off. OK?
