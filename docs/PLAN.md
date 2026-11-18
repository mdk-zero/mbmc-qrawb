# mbmc-qrawb plan

Approved on 2026-11-18. mbmc-qrawb is a Next.js rewrite of `../mbmc-qras`, the QR attendance kiosk at Metro Balayan Medical Center. The user asked for sensible defaults rather than a round of questions. Every choice below was made by Claude and can be revisited.

## What the system does
Employees scan the QR code on their ID card at a kiosk. The code holds their employee ID. The server rejects unknown codes and repeat scans inside a cooldown. Otherwise it records the attendance with the day's next queue number, and the kiosk prints an 80 mm ticket with that number and the employee's name, without showing a print dialog. The kiosk screen also shows a clock and today's scan log.

Admins can:
- add, edit and delete employees, with photos
- preview and download QR ID cards as PNG
- import employees in bulk from Excel
- browse attendance by date and name, and export it to Excel
- reprint tickets

## Carry over unchanged
- **QR content:** the employee ID only, so printed ID cards keep working.
- **URLs and port:** kiosk at `/`, admin at `/admin`, served on `http://localhost:3000`.
- **Database:** the same `qr_attendance` MySQL/MariaDB database under XAMPP. `users`, `attendance` and `daily_queue` keep their shape, and changes are additive. Switching over means pointing the new app at the existing database.
- **Printing:** a hidden print frame plus Chrome `--kiosk --kiosk-printing`, producing an 80 mm ticket.
- **Env var names:** `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`, `PORT`, `ADMIN_PASSWORD`.
- **Windows delivery:** an installer that bundles `node.exe`, plus a desktop shortcut that starts the server and opens Chrome in kiosk mode.

## Fixed along the way
| Old behavior | New behavior |
|---|---|
| Admin access is one shared `ADMIN_PASSWORD`. Login tokens are kept in an in-memory Set and lost on restart, stored in sessionStorage, and also accepted in the query string. | An `admins` table with bcrypt hashes and a signed httpOnly session cookie. The first admin is seeded from `ADMIN_PASSWORD`, and repeated failed logins are throttled. |
| The cooldown is hard-coded at 180 min, while the README says 10. | `settings.cooldown_minutes`, default 180, editable on an admin page. |
| `/api/attendance/today` falls back to the UTC date. | The server computes "today" in `APP_TIMEZONE` (default `Asia/Manila`). |
| Photos are sent as base64 JSON, with an 8 MB body limit. | Multipart upload with the same checks: PNG/JPEG/WebP, at most 5 MB, file signature verified. Stored in `uploads/employee-photos/` and served only to admins. |
| `xlsx` is installed but never used. | Dropped. `exceljs` handles both import and export. |
| The camera scanner is commented out in the UI, but `html5-qrcode` still tries to start on an element that doesn't exist. | The USB scanner (it types the code and presses Enter) is the main input. Camera scanning becomes an optional setting, using a maintained library chosen by research. |
| Schema upgrades are ad-hoc `ALTER TABLE` statements run on every boot. | Drizzle migrations. |

## Architecture

```
Kiosk PC (Windows)
 ├─ Chrome --kiosk --kiosk-printing → http://localhost:3000
 └─ bundled node.exe → Next.js standalone server
      ├─ pages:  /  (scanner)   /admin/* (login, employees, attendance, settings)
      ├─ /api/*  Route Handlers (scan, today's log, export, photo, QR, admin CRUD)
      ├─ src/server/*  services: scan, employees, attendance, auth, settings, excel
      └─ Drizzle + mysql2 → MySQL/MariaDB (XAMPP)      uploads/ → employee photos
```

```
mbmc-qrawb/
  src/app/            pages and /api Route Handlers
  src/server/         server-only: db schema and client, services, auth
  src/lib/contracts/  zod schemas shared by UI and backend (the handoff point)
  src/components/     ui/ (shadcn), kiosk/, admin/
  src/proxy.ts        redirects unauthenticated /admin requests to login
  drizzle/            migrations
  packaging/          installer, kiosk launcher
  docs/               PLAN.md, plans/ (planner output), research/ (researcher output)
  .claude/agents/     the six subagents
```

### Data flow
- Server Components read data by calling `src/server` services directly.
- Client components (the kiosk scanner and admin forms) call `/api/*` Route Handlers.
- Request and response bodies are defined once as zod schemas in `src/lib/contracts/`, and both sides validate against them.
- Admin pages are protected in two places: `src/proxy.ts` redirects to login, and every admin Route Handler checks the session itself.

### Database
Keep, unchanged: `users`, `attendance` and `daily_queue`, as defined in `../mbmc-qras/schema.sql` after the boot-time upgrades in `../mbmc-qras/server.js`.

Add:
- `admins`: id, unique username, password_hash, created_at, last_login_at
- `settings`: key, value, updated_at. Holds `cooldown_minutes`, `org_name`, `camera_enabled` and ticket options.

Starting point: run `drizzle-kit pull` against a database the old app has already initialized, so the Drizzle schema matches production exactly. Then add the new tables as migrations.

### Scan behavior to preserve
`POST /api/scan { code }` runs as one transaction:
1. Lock the user by `employee_id`.
2. If no user matches, return `404 failed`.
3. If the user's last scan is newer than the cooldown, return `429 duplicate` with the earlier scan time.
4. Otherwise:
   - Increment today's row in `daily_queue`.
   - Insert an `attendance` row that copies `employee_id`, the name and the position from `users`.
   - Return `success` with `queue_number` and `scanned_at`.

On the kiosk, after a submit, new scans are ignored for 2.5 s, and the result clears after 6 s.

### Starting endpoint list
The backend-planner decides the final shapes.
- Public: `POST /api/scan`, `GET /api/attendance/today`
- Auth: `POST /api/auth/login`, `POST /api/auth/logout`
- Admin:
  - `GET`/`POST /api/employees`
  - `PUT`/`DELETE /api/employees/[id]`
  - `GET`/`PUT /api/employees/[id]/photo`
  - `GET /api/employees/[id]/qr`
  - `POST /api/employees/import`
  - `GET /api/attendance` (filters: date, search)
  - `GET /api/attendance/export`
  - `GET`/`PUT /api/settings`

## Subagent team
The agent files are in `.claude/agents/`. The main session coordinates them. Subagents are able to start their own subagents, but these six don't get the `Agent` tool, so each one stays on its task.

| Agent | Model | Can do | Produces |
|---|---|---|---|
| ui-planner | opus | read, write plans | `docs/plans/ui-*.md`: screens, states, components, kiosk flow |
| ui-researcher | haiku | read, web, shadcn MCP, write research | `docs/research/ui-*.md`: Next/Tailwind/shadcn docs, scanning and printing libraries, what the old UI does |
| ui-implementer | sonnet | full edit, shadcn MCP, Playwright | pages and components in `src/app` and `src/components` |
| backend-planner | opus | read, write plans and contracts | `docs/plans/backend-*.md` and `src/lib/contracts/` |
| backend-researcher | haiku | read, web, `npm view`, write research | `docs/research/backend-*.md`: Drizzle, auth, standalone builds, exceljs, what the old `server.js` does |
| backend-implementer | sonnet | full edit | `src/server`, `src/app/api`, `drizzle/`, `packaging/`, tests |

Why these models:
- **Planners (opus):** they make the decisions everything else depends on, and they run rarely.
- **Implementers (sonnet):** they write most of the code at a lower cost.
- **Researchers (haiku):** they mostly read and summarize, and haiku is the fastest and cheapest.

## Steps
1. [x] **Initialize:**
   - `create-next-app` 16.4.6 with TypeScript, Tailwind, ESLint, the App Router and `src/`.
   - A fresh git repo.
   - `CLAUDE.md`, `.env.example`, the logo, and this plan.
2. [x] **Create the six agents.**
   - [ ] Give each one a small trial task in a session started inside this repo.
3. [ ] **Backend foundation:**
   - [x] Drizzle and mysql2. No production copy was available, so the schema is hand-written from the old code and still needs checking (see step 7).
   - [ ] The `admins` table. The `settings` table is done.
   - [x] Env config.
   - [ ] Login, logout and sessions, plus the `/admin` guard.
   - [ ] Contracts for every endpoint. The kiosk contracts are done.
4. [x] **Kiosk.** Done on 2026-11-18 from `docs/plans/backend-kiosk-scan.md` and `docs/plans/ui-kiosk-scanner.md`. UI and backend work in parallel from here.
   - Backend: the scan service (transaction, cooldown, queue number) with unit tests.
   - UI: the scanner screen (USB input, result card, today's log, clock, auto-reset) and ticket printing.
5. [ ] **Admin:**
   - Employee CRUD with photos.
   - QR preview and ID card PNG download.
   - Excel import.
   - Attendance list with search, Excel export and reprint.
   - Settings page: cooldown and admin password.
6. [ ] **Packaging:**
   - `output: "standalone"` build, with `.next/static` and `public` copied in.
   - Bundled `node.exe`, Node 24 or newer, because Vitest 5 needs `@types/node` ^24.
   - Put `.env` next to the standalone `server.js`. The server loads it from there, but the build doesn't copy it.
   - Inno Setup installer and an updated `Start-Kiosk.ps1`.
   - Grant camera permission through the `VideoCaptureAllowedUrls` policy, not `--use-fake-ui-for-media-stream` (see `docs/research/ui-kiosk-printing.md`).
7. [ ] **Cutover:**
   - Check every feature against mbmc-qras.
   - A Playwright test for scan → ticket.
   - A trial run on a kiosk PC against a copy of the live database.
   - Run the database checks Q1–Q4 from `docs/plans/backend-kiosk-scan.md` against the kiosk's XAMPP: time zone, `employee_id` collation, `drizzle-kit pull` against the hand-written schema, and the MariaDB version. Run `npm run test:db` against that version too.
   - Run the real-kiosk checks in `docs/research/ui-kiosk-printing.md` and the UI implementer's list: 80 mm output, `afterprint` timing, back-to-back tickets, the USB scanner's key timing, and the webcam decode test before turning on `camera_enabled`.
   - Then switch the shortcut over.

## Out of scope
- Cloud hosting, or any need for the internet.
- An employee self-service portal.
- Changing the QR format.

## Open items (not blocking)
- ~~Which camera scanning library to use.~~ Settled: `barcode-detector` (zxing-wasm), with the wasm served from `public/zxing/`.
- Whether to replace browser printing with direct ESC/POS printing later.
- Running the server as a Windows service, so it starts at boot instead of from the shortcut.
- With several kiosks pointing at one server, recording which kiosk took each scan.
