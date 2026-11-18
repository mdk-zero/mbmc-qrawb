# mbmc-qrawb

@AGENTS.md

QR attendance kiosk for Metro Balayan Medical Center. This is a Next.js rewrite of `../mbmc-qras` (Express + React/Vite + MySQL). That repo stays untouched as the behavior reference. The full plan is in `docs/PLAN.md`.

## Commands
- `npm run dev`: dev server on http://localhost:3000
- `npm run build` / `npm start`
- `npm run lint`
- `npx tsc --noEmit`: type check
- `npm test`: unit tests (no database)
- `npm run test:db:start` / `npm run test:db:stop`: throwaway MariaDB on 127.0.0.1:3307 (needs `mariadbd` installed locally)
- `npm run test:db`: integration tests against `TEST_DB_*` (default: the throwaway server)
- `npm run db:generate`: drizzle-kit generate (after a schema change)
- `npm run db:migrate`: preflight check, then apply migrations to `DB_*` from `.env`

## Rules that must not break
- A QR code contains only the employee ID. Printed ID cards in use depend on this.
- Stay compatible with the existing `qr_attendance` MySQL/MariaDB database. `users`, `attendance` and `daily_queue` keep their tables and columns, and every schema change is additive. The old schema is `../mbmc-qras/schema.sql` plus the boot-time upgrades in `../mbmc-qras/server.js`.
- Scan times are stored as local `DATETIME` values, as in the old app. The server decides what "today" is using `APP_TIMEZONE` (default `Asia/Manila`), never the browser and never UTC.
- URLs stay put: kiosk at `/`, admin at `/admin`, port 3000.
- Tickets print through the browser, using Chrome `--kiosk --kiosk-printing`. The ticket is 80 mm and shows the queue number and the employee's name.
- `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`, `PORT` and `ADMIN_PASSWORD` keep their old meanings, so existing kiosk `.env` files still work.
- The app runs on a LAN with no internet, so nothing loads from a CDN at runtime.

## Stack
- Next.js 16 App Router: TypeScript, Turbopack, `cacheComponents` on.
- React 19, Tailwind CSS v4 and shadcn/ui.
- MySQL/MariaDB through `mysql2` + Drizzle ORM.
- zod, exceljs, qrcode and bcryptjs.
- Admin sessions in a signed httpOnly cookie.
- Shipped as `output: "standalone"` with a bundled `node.exe` and an Inno Setup installer.

This Next.js version differs from older ones. Check `node_modules/next/dist/docs/` before using a Next.js API.

## Layout and ownership
| Path | Owner |
|---|---|
| `src/lib/contracts/` (zod schemas and types for every API) | backend-planner. UI code imports from here but never edits it. |
| `src/server/` (server-only db, services, auth), `src/app/api/`, `src/proxy.ts`, `drizzle/`, `packaging/` | backend-implementer |
| `src/app/` (everything except `api/`), `src/components/`, `public/` | ui-implementer |
| `docs/plans/ui-*.md` | ui-planner |
| `docs/plans/backend-*.md` | backend-planner |
| `docs/research/` | ui-researcher, backend-researcher |

## Data flow
- Server Components read data by calling the services in `src/server/` directly.
- Client components (the kiosk scanner and admin forms) call the `/api/*` Route Handlers.
- Every request and response body uses a zod schema from `src/lib/contracts/`, and both sides validate against it.
- Every file under `src/server/` starts with `import "server-only"`.

## Team workflow
The main session coordinates the agents:
1. A researcher answers specific questions and saves the findings to `docs/research/<area>-<topic>.md`.
2. A planner turns the research and `docs/PLAN.md` into a plan at `docs/plans/<area>-<feature>.md`. The backend-planner also writes the contracts.
3. The user approves the plan.
4. An implementer builds it, runs lint, the type check and the tests, and reports back.

The contracts must exist before the UI and backend implementers work on the same feature in parallel. Agents don't commit; the main session commits when the user asks.
