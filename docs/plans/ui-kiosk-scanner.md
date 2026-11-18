# UI plan: kiosk scanner screen (`/`)

Status: draft for approval. Written 2026-11-18 by the ui-planner.
Contracts: `src/lib/contracts/scan.ts` and `src/lib/contracts/attendance.ts` did not exist when this plan was written. The plan uses the old response shapes from `docs/research/backend-scan-flow.md`. Every field it relies on is listed in section 10, "Contract dependencies". Once the contracts land, the implementer uses the contract field names. If a contract renames a field, follow the contract and keep the behavior described here. If a field is missing, stop and report it.

## 1. Goal

This plan builds the kiosk screen at `/` for `docs/PLAN.md` step 4 (Kiosk, UI half). The screen has:
- USB scanner input, plus an optional camera.
- A result card that is readable from standing distance and resets itself.
- Today's scan log.
- A clock, the org name and the logo.
- Automatic 80 mm ticket printing after a successful scan.

It keeps the old behavior from "Scan behavior to preserve":
- Scans arrive within 2.5 s of the last request finishing are ignored.
- The result clears after 6 s.
- Only `success` prints.
- The log refreshes after `success` and `duplicate`.

Changes from the old kiosk, all deliberate:
- **No page reload after printing.** The result card stays up for its 6 s.
- **No click-only UI.** The "Print receipt" button, its dialog and the login modal are removed. Reprints happen in admin (step 5).
- **Server errors and an unreachable server look different.** The old app showed a 500 as an empty card, and showed a non-JSON error page as "Cannot reach the server".
- **Ignored scans are no longer silent.** A scan dropped by the guard shows a "please wait" hint.
- **The camera works**, behind `camera_enabled`. The old camera path was dead code.
- **"Today" and the clock come from the server's timezone**, not the browser's date.

## 2. Routes and files

### Component tree

```
src/app/layout.tsx                               server   (root layout: font, <html lang="en">, light theme only)
src/app/(kiosk)/page.tsx                         server   KioskPage: static shell + <Suspense> around KioskData
├─ src/app/(kiosk)/kiosk-data.tsx                server   KioskData: await connection(); reads settings + today's log via services
│   └─ src/components/kiosk/kiosk-screen.tsx     client   KioskScreen: owns the scan controller, key listener, printer, log
│       ├─ kiosk-header.tsx                      (client by import)  logo, org name, <KioskClock>
│       │   └─ kiosk-clock.tsx                   client   ticking clock in APP_TIMEZONE
│       ├─ offline-banner.tsx                    (client by import)  Alert, shown while the server is unreachable
│       ├─ scan-stage.tsx                        (client by import)  left panel: idle / submitting / result, ready strip
│       │   ├─ idle-prompt.tsx                   (client by import)
│       │   ├─ result-card.tsx                   (client by import)  Card, Badge, Progress
│       │   └─ camera-panel.tsx                  client   next/dynamic(() => import("./camera-preview"), { ssr: false })
│       │       └─ camera-preview.tsx            client   <video> + use-qr-camera
│       ├─ today-log.tsx                         (client by import)  Card, Table, Skeleton, Badge
│       └─ kiosk-footer.tsx                      (client by import)  "Employee Attendance System", Admin link
├─ src/app/(kiosk)/kiosk-shell.tsx               server   the static frame used as the Suspense fallback (logo, empty clock slot, skeletons)
└─ src/app/(kiosk)/error.tsx                     client   error boundary that retries on its own
```

Hooks and helpers, none of which render anything:

| File | Kind | Purpose |
|---|---|---|
| `src/components/kiosk/use-scanner-input.ts` | client hook | Global keyboard-wedge listener. Calls `onScan(code)`. |
| `src/components/kiosk/use-scan-controller.ts` | client hook | The state machine (useReducer), submit, guard, timers, print and log-refresh triggers. |
| `src/components/kiosk/scan-api.ts` | client module | `postScan` and `getTodayLog`: fetch, timeout and zod validation against the contracts. |
| `src/components/kiosk/use-today-log.ts` | client hook | Log state, polling, refresh after a scan, date rollover. |
| `src/components/kiosk/use-ticket-printer.ts` | client hook | One persistent hidden iframe, a FIFO print queue and the single-flight guard. |
| `src/components/kiosk/ticket-template.ts` | plain module | The ticket's HTML and CSS string, with no data in it. |
| `src/components/kiosk/use-qr-camera.ts` | client hook | getUserMedia lifecycle and the detect loop. Imported only by `camera-preview.tsx`. |
| `src/components/kiosk/zxing.ts` | client module | Lazy singleton: `prepareZXingModule` with `locateFile` pointing at the self-hosted wasm, then a `BarcodeDetector({ formats: ["qr_code"] })`. |
| `src/components/kiosk/format.ts` | plain module | `formatScanTime` (uses `parseLocalDateTime`), `formatClock`, `ticketName`. |
| `src/components/kiosk/use-hide-idle-cursor.ts` | client hook | Hides the mouse cursor after 3 s without movement. |

Static asset: `public/zxing/zxing_reader.wasm`, copied from `node_modules/zxing-wasm/dist/reader/zxing_reader.wasm` and committed (see section 13, step 2).

Remove: `src/app/page.tsx` (the create-next-app page; it would clash with `(kiosk)/page.tsx`), plus `public/next.svg`, `vercel.svg`, `file.svg`, `globe.svg` and `window.svg`.

### Why each file is server or client

- **`layout.tsx`: server.** It has no interactivity. Keep Geist through `next/font/google`. That is self-hosted: the font files are downloaded at build time and served from `/_next/static`, so the browser makes no runtime request to Google. Set `metadata.title` to "MBMC Attendance Kiosk". Remove the `prefers-color-scheme: dark` block from `globals.css` (shadcn init rewrites this file anyway) so the kiosk is always light.
- **`(kiosk)/page.tsx`: server, synchronous.** It renders `<Suspense fallback={<KioskShell />}><KioskData /></Suspense>`. The route group `(kiosk)` keeps the URL at `/` and gives the kiosk its own `error.tsx` without affecting `/admin`.
- **`(kiosk)/kiosk-data.tsx`: server, async.** It calls `await connection()` first (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`), so nothing touches the database during `next build`. Under `cacheComponents` the read is uncached and streams in behind the Suspense fallback (`.../01-getting-started/08-caching.md`, "Streaming uncached data"). It then runs `getKioskSettings()` (from `@/server/services/settings`) and `getTodayAttendance()` (from `@/server/services/attendance`) and passes plain serializable props to `KioskScreen`. No `"use cache"`: settings must be fresh on every load. If `getKioskSettings()` rejects, it catches the error and uses `getDefaultKioskSettings()` (`camera_enabled: false`, `org_name: "Metro Balayan Medical Center"`, ticket options off). If `getTodayAttendance()` rejects, it passes `initialLog: null`. The client then shows the offline banner and retries. A kiosk must recover on its own rather than show an error page.
- **`kiosk-shell.tsx`: server.** It is the static frame (logo, an "Employee Attendance" placeholder for the org name, skeleton panels). It is prerendered into the static shell, so the screen is never blank while the database read runs.
- **`kiosk-screen.tsx`: client.** It needs global key listeners, timers, fetch and the print iframe. Its children have no `"use client"` directive of their own; they become client code because this file imports them.
- **`kiosk-clock.tsx`: client.** It ticks. On the server and during hydration it renders an empty, fixed-width slot (`--:--`) and never calls `new Date()` in render. This avoids hydration mismatches and the `blocking-prerender-current-time` rule.
- **`camera-preview.tsx`: client-only, through `next/dynamic(..., { ssr: false })` inside `camera-panel.tsx`.** `ssr: false` is only allowed in client components (`.../02-guides/lazy-loading.md`). The module, `barcode-detector`, `zxing-wasm` and the 1 MB wasm are only fetched when `camera_enabled` is true.
- **`(kiosk)/error.tsx`: client** (error boundaries must be). It shows "Something went wrong. Restarting the scanner…" and calls `retry()` every 10 s. There is no button.

### StrictMode and `cacheComponents` rules for the implementer

StrictMode is on by default in the App Router, so in dev every effect mounts, unmounts and mounts again.
- **Never start a fetch, a print or a log refresh from an effect that watches result state.** They are started inside the submit path, which is an async function called from the key or camera handler. A double-run effect therefore can't double-print or double-submit.
- **Every effect must undo itself completely.** That covers:
  - the key listener (add and remove the same function)
  - intervals and timeouts
  - the print iframe (append on mount, remove on cleanup)
  - camera tracks (section 8)
- **The print queue lives in a ref inside `use-ticket-printer`**, not at module scope, so a remount starts with a clean queue and a fresh iframe.
- **The zxing detector singleton is the one module-level object.** It holds no DOM or stream, so sharing it across mounts is safe.

## 3. Layout

Target viewports are 1366×768 and 1920×1080, landscape. Use `h-dvh` with no page scroll, `overflow-hidden` and `select-none` on the kiosk root. The grid is a header row, an optional banner row, the main row and a footer row. The main row has two columns: the scan stage takes `minmax(0,1.6fr)` and the log takes `minmax(0,1fr)`.

Type sizes (use `clamp()` so both resolutions work without breakpoints):

| Element | 1366×768 | 1920×1080 |
|---|---|---|
| Queue number on the result card | ~150 px | ~200 px |
| Result title ("Scan successful") | ~40 px | ~52 px |
| Employee name on the card | ~44 px | ~56 px |
| Idle heading "Ready to scan" | ~48 px | ~64 px |
| Clock time | ~40 px | ~52 px |
| Log row name | ~20 px | ~24 px |
| Body / secondary text | ≥ 18 px | ≥ 22 px |

Use `tabular-nums` for every number. Each status has its own color, icon and title, so meaning never relies on color alone:
- success: emerald
- duplicate: amber
- failed: rose
- error / unreachable: slate background with a rose icon

### Idle (camera off)

```
+----------------------------------------------------------------------------------+
| [logo] Metro Balayan Medical Center                              8:05:12 AM      |
|        Employee Attendance                            Wednesday, November 18 2026 |
+--------------------------------------------------+-------------------------------+
|                                                  | Today's scan logs     42 scans|
|                    [ QR icon ]                   | Wed, Nov 18, 2026             |
|                                                  |-------------------------------|
|                  Ready to scan                   | 42  Juan Dela Cruz    8:05 AM |
|    Scan the QR code on your ID card with the     |     EMP-0012 • Staff Nurse    |
|     scanner to record your attendance.           | 41  Maria Santos      8:04 AM |
|                                                  |     EMP-0007 • Pharmacist     |
|            (●) Waiting for QR code               | ...                           |
|                                                  | (rows that don't fit are cut  |
|--------------------------------------------------|  off with a fade, newest top) |
| ● Ready for the next scan                        |                               |
+--------------------------------------------------+-------------------------------+
| Employee Attendance System                                                 Admin |
+----------------------------------------------------------------------------------+
```

### Idle (camera on, running)

```
+--------------------------------------------------+
|   +--------------------------------------+       |
|   |                                      |       |
|   |     live mirrored preview 4:3        |       |
|   |        [ corner-bracket frame ]      |       |
|   |                                      |       |
|   +--------------------------------------+       |
|                  Ready to scan                   |
|   Scan your ID card with the scanner, or hold    |
|        its QR code up to the camera.             |
|--------------------------------------------------|
| ● Ready for the next scan            ● Camera on |
+--------------------------------------------------+
```

The preview box is about 55% of the stage height. Results are drawn as a layer over the whole stage, including the preview. The `<video>` stays mounted underneath, so the stream never restarts between scans.

### Submitting (shown only if the request takes longer than 300 ms)

```
+--------------------------------------------------+
|                 [ spinner ]                      |
|              Checking your ID…                   |
|--------------------------------------------------|
| ● Please wait                                    |
+--------------------------------------------------+
```

### Success

```
+--------------------------------------------------+  emerald-50 background, emerald border
| [✓]  Scan successful          [Attendance recorded]|
|                                                  |
|                  QUEUE NUMBER                    |
|                       42                         |
|                Juan Dela Cruz                    |
|      EMP-0012  •  Staff Nurse  •  8:05 AM        |
|                                                  |
|        Please take your printed ticket.          |
|  Your attendance has been processed successfully.|
| [██████████████░░░░░░░░] (6 s dwell bar)         |
|--------------------------------------------------|
| ● Please wait                                    |   ("Ready for the next scan" once the 2.5 s lock ends)
+--------------------------------------------------+
```

If printing fails, the line "Please take your printed ticket." becomes a rose `Alert`: "The ticket could not be printed. Please ask HR to reprint it."

### Duplicate

```
+--------------------------------------------------+  amber-50
| [⧉]  Duplicate scan               [Already recorded]|
|                                                  |
|   Duplicate scan. Already recorded — try again   |
|   in 174 min.                                    |   (server message, as-is)
|                                                  |
|                Juan Dela Cruz                    |
|   EMP-0012  •  Staff Nurse  •  Last scanned 8:05 AM |
|                                                  |
|  Your existing attendance record has been preserved.|
| [dwell bar]                                      |
+--------------------------------------------------+
```

### Failed (unknown code)

```
+--------------------------------------------------+  rose-50
| [!]  Scan failed                   [Action required]|
|                                                  |
|   QR code not recognized. Ask your admin to      |
|   register you.                                  |   (server message, as-is)
|                                                  |
|  Please check the message above and try again if needed.|
| [dwell bar]                                      |
+--------------------------------------------------+
```

### Error / server unreachable

```
+----------------------------------------------------------------------------------+
| [!] Server unreachable. Scans are not being recorded. Retrying…                  |  <- OfflineBanner (unreachable only)
+--------------------------------------------------+-------------------------------+
| [!]  Scan failed                   [Action required]| (log keeps its last rows,    |
|                                                  |  with "Last updated 8:03 AM") |
|   Cannot reach the server. Check your connection |                               |
|   and try again.                                 |                               |
|  Please check the message above and try again if needed.|                       |
+--------------------------------------------------+-------------------------------+
```

The server-error variant has the same card with the server's message (or the fallback text) and no banner.

## 4. States and exact text

Strings marked "old" are copied verbatim from `../mbmc-qras/client/src/pages/Scanner.jsx` or `server.js`. Strings marked "new" are introduced by this plan.

### Scan stage

| State | Title | Badge | Body | Footer line | Source |
|---|---|---|---|---|---|
| Idle, camera off | "Ready to scan" | none | "Scan the QR code on your ID card with the scanner to record your attendance." | chip "Waiting for QR code" | title and chip old; body new (the old body mentions a camera that never ran) |
| Idle, camera on | "Ready to scan" | none | "Scan your ID card with the scanner, or hold its QR code up to the camera." | chip "Waiting for QR code" | new body |
| Submitting (>300 ms) | "Checking your ID…" | none | none | none | new |
| Success | "Scan successful" | "Attendance recorded" | `message` from the server ("Attendance recorded." today) is not shown, because the title says it. Shown instead: the "Queue number" label, the number, the full name, then `employee_id • position • h:mm AM`, then "Please take your printed ticket." | "Your attendance has been processed successfully." | title, badge, label and footer old; the ticket line is new |
| Success, print failed | as Success | as Success | "Please take your printed ticket." is replaced by an `Alert` (destructive): "The ticket could not be printed. Please ask HR to reprint it." | as Success | new (the old text pointed at a button that no longer exists) |
| Duplicate | "Duplicate scan" | "Already recorded" | server `message`, as-is (old: "Duplicate scan. Already recorded — try again in N min."), then the name, then `employee_id • position • Last scanned h:mm AM` | "Your existing attendance record has been preserved." | old, except that the label changes from "First scanned" to "Last scanned", because the time shown is the most recent scan |
| Failed | "Scan failed" | "Action required" | server `message`, as-is (old: "QR code not recognized. Ask your admin to register you.") | "Please check the message above and try again if needed." | old |
| Failed (client-side: code fails `ScanRequest` validation, e.g. longer than the contract's max) | "Scan failed" | "Action required" | "QR code not recognized. Ask your admin to register you." | as Failed | old text |
| Error (server answered `status: "error"`, or any non-JSON / unparseable HTTP response) | "Scan failed" | "Action required" | server `message` if present and valid, otherwise "Server error. Please try again, or ask HR for help." | "Please check the message above and try again if needed." | title, badge and footer old; fallback body new |
| Unreachable (fetch rejected or the 10 s timeout fired) | "Scan failed" | "Action required" | "Cannot reach the server. Check your connection and try again." | as Error | old |

The stage's bottom "ready strip" is always visible:

| Condition | Text | Dot |
|---|---|---|
| Not in flight, not locked | "Ready for the next scan" | green |
| In flight or locked | "Please wait" | amber |
| A scan was dropped by the guard (shown for 2 s) | "Please wait a moment, then scan again." | amber, pulsing |
| Camera running (right side, camera on only) | "Camera on" | green |

### Camera states (only when `camera_enabled` is true)

Camera problems never block the USB scanner. In an error state the preview box is replaced by a compact tile in the same spot: a camera icon, a title and a body. The stage keeps the idle text for the scanner.

| Camera status | Tile title | Tile body | Auto-retry |
|---|---|---|---|
| `loading` (wasm and module loading) | "Starting camera…" | "Please wait." | n/a |
| `starting` (getUserMedia pending; also covers the permission prompt) | "Starting camera…" | "Please allow camera access when your browser requests permission." (old) | n/a |
| `running` | no tile; the preview is shown | | |
| `denied` (NotAllowedError) | "Camera not available" (old) | "Camera unavailable. Allow camera access to use the scanner." (old) + " You can still use the scanner." | no (Chrome remembers the denial; HR must fix the permission) |
| `no-camera` (NotFoundError, OverconstrainedError, or no video inputs) | "Camera not available" | "Connect a camera to use the scanner." (old) | on `devicechange`, and every 30 s |
| `in-use` (NotReadableError, AbortError) | "Camera not available" | "The camera is being used by another program. Retrying…" | every 10 s |
| `insecure` (no `navigator.mediaDevices`, or SecurityError) | "Camera not available" | "The camera only works when the kiosk is opened at http://localhost:3000." | no |
| `error` (wasm failed to load, or anything else) | "Camera not available" | "Camera scanning could not start. Use the scanner." | every 30 s |

### Today's log

| State | What shows |
|---|---|
| Initial (server read succeeded) | Rows from `initialLog` straight away. No spinner. |
| Initial (server read failed) | 6 `Skeleton` rows until the first client fetch succeeds. |
| Empty | "No scans recorded yet" + "The current day's attendance list will appear here after each scan." (both old) |
| Rows | Header "Today's scan logs" (old) + the server date formatted as "Wed, Nov 18, 2026" + a count badge "N scans" (new). Each row shows the queue number, then the name ("Unknown employee" (old) if empty), then a second line `employee_id • position` (missing ID shows "No ID", old), then the time `h:mm AM`. Newest first. Render at most 100 rows. The count shows the full total. |
| New row highlight | The row for the employee just scanned (matched on queue number + employee_id) gets an emerald background for 3 s. |
| Refresh failed, rows known | Rows stay. The header shows "Last updated h:mm AM" in amber. |
| Refresh failed, no rows known | "Scan log unavailable. Retrying…" in place of the empty state. |

### Header and banner

- **Logo and org name.** `public/logo.png` at 56 px (1366) / 72 px (1920). Use `next/image` with `unoptimized` so the request goes straight to `/logo.png` and not through `/_next/image`; the ticket uses the same URL, so it is already cached. Next to it: `org_name` from settings, with the subtitle "Employee Attendance" (old).
- **Clock.** Time as `h:mm:ss AM`, with the seconds smaller. The date line reads "Wednesday, November 18, 2026". Both come from `Intl.DateTimeFormat("en-PH", { timeZone })`, where `timeZone` is the server's `APP_TIMEZONE` passed in props.
- **OfflineBanner.** A destructive `Alert` across the full width under the header: "Server unreachable. Scans are not being recorded. Retrying…" (new). It shows while `connection === "unreachable"` and hides on the next successful request of any kind.
- **Footer.** Left: "Employee Attendance System" (old). Right: a small, low-contrast "Admin" link (see section 5, Focus).

## 5. Interaction details

### USB scanner input (`use-scanner-input`)

- The listener is `window.addEventListener("keydown", handler, { capture: true })`. It works with nothing focused, because events target `document.body` and still reach `window` in the capture phase.
- The handler ignores an event, and leaves it untouched, when any of these is true:
  - `event.target` is an INPUT, TEXTAREA or SELECT, or is contentEditable (old rule; the kiosk has none, but this keeps future admin overlays safe)
  - `event.ctrlKey`, `event.altKey` or `event.metaKey` is set, so shortcuts like Ctrl+R and F5 pass through and don't pollute the buffer
  - `event.isComposing` is true
- **Buffering (old rule, kept):**
  - If more than 300 ms has passed since the previous key, reset the buffer first.
  - A key with `event.key.length === 1` is appended. Shift is not appended: it is a key name longer than one character, and the shifted character arrives as its own key.
  - The buffer is capped at 64 characters. Anything over that is dropped, and the code then fails validation.
- **Enter** (`event.key === "Enter"`, which also covers NumpadEnter):
  - Trim the buffer, then clear it.
  - If the trimmed code is non-empty, call `event.preventDefault()` so Enter can't activate a focused element, then call `onScan(code, "usb")`.
  - If it is empty, do nothing and don't prevent the default.
- **The handler never calls `preventDefault` on printable keys.** Nothing is swallowed.
- **Telling a person from a scanner.** No extra discrimination beyond the 300 ms gap, the same as the old app. A person who types an ID fast enough and presses Enter is submitted. That is acceptable and occasionally useful (a worn card can be typed in): the server treats a typed ID exactly like a scanned one, and the old app allowed the same thing. Slow typing simply resets the buffer and does nothing.

### Submit path and guard (`use-scan-controller`)

USB and camera both call one function, `scan(code, source)`. It runs these checks in order:
1. **In flight.** If a request is in flight, drop the scan and show the "Please wait a moment, then scan again." hint.
2. **Locked.** If `now < lockedUntil`, drop the scan and show the same hint.
3. **Same code.** If the code equals the last submitted code, that submit was less than 10 s ago, and its outcome was `success` or `duplicate`, drop it silently. The current card stays. This stops a card held under the camera, or a double trigger pull, from replacing the success card with a duplicate card before the person has read their number. It does not apply after `failed`, `error` or `unreachable`, so retries work.
4. **Validation.** If `scanRequestSchema.safeParse({ code })` fails, show Failed (client-side) and set the lock.
5. **Otherwise, submit:**
   - Set `inflight = true`.
   - Start a 300 ms timer that switches the stage to Submitting if the response hasn't arrived.
   - Call `postScan(code)`.

**`postScan`** in `scan-api.ts`:
- **Request:** `fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal })`. The signal comes from an `AbortController` with a 10 s timeout.
- **Fetch rejects or times out:** return `{ kind: "unreachable" }`.
- **Otherwise:** read the body as text, then `JSON.parse` it, then `scanResponseSchema.safeParse` it, whatever the HTTP status. 404 and 429 are normal results.
  - If parsing succeeds, return the contract union.
  - If it fails (an HTML error page, or a body that doesn't match), return a local `{ kind: "bad-response" }`. It is shown as the Error state with the fallback text. This fixes the old bug where every such failure looked like a network problem.

When the outcome arrives:
- Set `inflight = false` and `lockedUntil = now + 2500`. The lock runs 2.5 s after the request finishes, the same as old `releaseTimer`.
- Clear the Submitting timer, then show the result card and restart the 6 s dwell timer. A newer result cancels the older timer (old behavior).
- On `success`:
  - Call `printer.enqueue({ queueNumber, name })`.
  - Call `log.refreshNow()`.
  - Set `connection = "ok"`.
- On `duplicate`: call `log.refreshNow()` and set `connection = "ok"`.
- On `failed` or `error`: set `connection = "ok"`. The server answered, so it isn't offline.
- On `unreachable`: set `connection = "unreachable"`. The banner appears and log polling switches to 5 s.

A scan that arrives while a request is still in flight is dropped (check 1), never queued. The employee sees "Please wait a moment, then scan again." and the readiness dot turns green when they can try again. Queueing scans would print tickets in an order people can't follow.

Timers:
- Dwell: 6 s per result. A print failure restarts it at 10 s so the HR note can be read.
- Lock: 2.5 s after the response.
- Dropped-scan hint: 2 s.

The dwell bar in the card shows the 6 s (or 10 s) visually. All timers are cleared on unmount.

### State machine

State: `{ view: "idle" | "submitting" | "result", result?: ResultView, inflight: boolean, lockedUntil: number | null, hintUntil: number | null, last?: { code, at, outcome }, connection: "ok" | "unreachable" }`

| From view | Event | Guard | Next view | Effects |
|---|---|---|---|---|
| any | `SCAN(code, src)` | `inflight` or locked | unchanged | `hintUntil = now + 2000` |
| any | `SCAN` | same code < 10 s, last outcome success/duplicate | unchanged | none |
| any | `SCAN` | `scanRequestSchema` invalid | `result` (failed, client) | lock 2.5 s, dwell 6 s |
| any | `SCAN` | passes | unchanged (previous card stays up for up to 300 ms) | `inflight = true`, start request, start 300 ms timer |
| any | `SLOW_TIMER` | `inflight` | `submitting` | none |
| any | `OUTCOME(success)` | | `result` (success, print pending) | lock, dwell 6 s, enqueue print, refresh log, `connection = ok` |
| any | `OUTCOME(duplicate)` | | `result` (duplicate) | lock, dwell 6 s, refresh log, `connection = ok` |
| any | `OUTCOME(failed)` | | `result` (failed) | lock, dwell 6 s, `connection = ok` |
| any | `OUTCOME(error)` | | `result` (error) | lock, dwell 6 s, `connection = ok` |
| any | `OUTCOME(unreachable)` | | `result` (unreachable) | lock, dwell 6 s, `connection = unreachable` |
| `result` | `PRINT_FAILED(queueNumber)` | card is still this success | `result` (success + printError) | dwell restarts at 10 s |
| `result` | `DWELL_END` | | `idle` | none |
| any | `LOCK_END` | | unchanged | `lockedUntil = null` |
| any | `LOG_OK` / `LOG_FAIL` | | unchanged | `connection = ok` / `unreachable` (only on a network failure) |

The camera's `paused` input is `inflight || locked`.

### Focus and the "no focus theft" rules

- **The kiosk renders no focusable control in normal use.** The one link, "Admin" in the footer, has `tabIndex={-1}`. A mouse click on it navigates to `/admin`, where the proxy sends the user to the login page.
- **Not on the kiosk:** no dialogs, no toasts that take focus, no `autoFocus`, no `<input>`.
- **Printing must not move focus into the iframe.** Never call `iframe.contentWindow.focus()`, which the old code did before `print()`. Keydown events inside the iframe document don't reach the parent `window`, so scans would silently stop working. Once the old app stopped reloading, this would have been the bug.
- **After each print job, restore focus:**
  - If `document.activeElement` is not `document.body`, blur it.
  - Call `window.focus()`.
- **A safety net for any other focus loss:**
  - A `window` `blur` listener schedules `window.focus()` 100 ms later, unless `document.hidden` is true.
  - A `focusin` listener blurs any element that receives focus, so `document.activeElement` stays `document.body`.
- **Mouse cursor.** `use-hide-idle-cursor` sets `cursor: none` on the root after 3 s without `mousemove`. Any mouse movement brings it back.

### After printing

Nothing navigates or reloads. The card stays for its dwell, then returns to idle. Fallback if research shows Chrome throttles repeated `print()` calls on a page that never reloads (open question R1): reload the page when the stage returns to idle after a success, which is no earlier than 6 s after printing. That keeps the result card visible and still resets the page between tickets. Use this fallback only if R1 confirms the problem.

### Today's log refresh (`use-today-log`)

- **Initial rows** come from `initialLog`, the server read.
- **Refresh right away** after `success` and `duplicate` (old behavior).
- **Poll every 20 s** to pick up scans from other kiosks. Poll every 5 s while `connection === "unreachable"`, so the banner clears quickly.
- **No overlapping fetches.** Skip a tick if a fetch is in flight. Pause while `document.hidden`.
- **The request** is `GET /api/attendance/today` with no `date` parameter. The server decides "today" in `APP_TIMEZONE`. The browser never sends a date (this fixes old bug 6).
- **Date rollover.** When a response's `date` differs from the current one:
  - Replace the rows.
  - Call `router.refresh()` once, so the Server Component re-reads settings. That is how changes to `camera_enabled`, `org_name` and the ticket options reach a kiosk that never reloads.
  - Client state (the current card, the camera stream) is kept across the refresh.
  - HR can also press F5 to pick up settings right away. F5 passes through the key handler.
- **Network failures.** A fetch rejection sets `connection = "unreachable"`. A non-2xx response or a body that fails the schema counts as a log error (amber "Last updated"), but not as unreachable.

### Clock

- `KioskClock` keeps `serverOffsetMs`, which defaults to 0.
- Each successful log response updates it from the HTTP `Date` header: server time minus `Date.now()` at receipt. The correction is only applied when the difference is larger than 2 s. This keeps the clock right if a LAN kiosk's PC clock drifts.
- The clock re-renders every second, aligned to the second boundary with a `setTimeout` chain.
- It formats with `timeZone = props.timezone` (`APP_TIMEZONE`), never the browser's zone.

## 6. Ticket printing

### The frame (`use-ticket-printer`)

- **Creation.** On mount, create one `<iframe>` imperatively and append it to `document.body`. On unmount, remove it. In StrictMode it is created, removed and created again, which is harmless.
- **Attributes:**
  - `aria-hidden="true"`, `tabindex="-1"`, `title="Ticket"`
  - style `position: fixed; right: 0; bottom: 0; width: 1px; height: 1px; border: 0; opacity: 0; pointer-events: none`
  - This is the old 1 px approach, known to print on the kiosk. Don't use `display: none`.
- **Content.** Set `iframe.srcdoc = TICKET_TEMPLATE`. A srcdoc document inherits the parent's base URL, so `/logo.png` resolves to the same origin. Readiness is a promise: resolve it on the iframe's `load` event, or straight away if `contentDocument.readyState === "complete"` and the template's root element is present. Reject it after 3 s.
- **The template is loaded once.** Each print only fills the template's elements with `textContent` (never `innerHTML`), so no escaping is needed and nothing has to reload per ticket.

### Template (`ticket-template.ts`, CSS kept from the old `printReceipt.js`)

- **`@page { size: 80mm auto; margin: 0; }`**, kept byte for byte. This is the rule the deployed printer already prints correctly with. Whether Chrome actually reads `80mm auto` or ignores it and uses the driver's paper size is open question R2. Don't change it until R2 is answered and the printer is tested.
- **Page box.** `html, body { width: 80mm; margin: 0; padding: 0; background: #fff; }`, plus `print-color-adjust: exact`.
- **Fonts.** The ticket uses `font-family: Arial, Helvetica, sans-serif`, the old ticket font. Arial is installed on every Windows kiosk, so there is no web font to load, nothing to wait for, and nothing fetched. Don't load Geist into the ticket.
- **Text color.** Pure black `#000`; thermal printers dither grays.
- **Body, kept from the old layout.** A centered flex row with a 4 mm gap and padding `0 3mm`:
  - `.number`: 50 pt, weight 900, `line-height: 1`
  - `.name`: 16 pt, weight 700, `overflow-wrap: anywhere`
- **Optional parts.** Each is hidden by default and enabled only by its ticket option (see Needs from backend):
  - Header: `<img class="logo" src="/logo.png">`, 16 mm wide, `filter: grayscale(1)`, above the org name in 11 pt bold. Covers `show_logo` and `show_org_name`.
  - A footer line with the date and time in 9 pt, from `scanned_at`. Covers `show_scan_time`.
- **Default.** With every option off, the ticket matches the old one exactly: number and name.

### Print flow

1. `enqueue(job)` pushes `{ queueNumber, name, scannedAt }` onto a FIFO in a ref. The queue holds at most 10 jobs. Overflow is dropped and reported as a print failure for that job. If no job is running, start the next one.
2. Single flight: a `printing` flag in a ref. Only one job runs at a time, and the next starts only after the current one has finished and 500 ms have passed. A second scan therefore never starts a print while one is running. It waits in the queue, and its ticket comes out after the first. Nothing is dropped.
3. For each job:
   1. Await the frame's readiness (3 s timeout).
   2. Fill the elements with `textContent`:
      - `.number`: the queue number
      - `.name`: `ticketName(employee)`, which is `employee.full_name` with spaces collapsed, or "Employee" (old) if empty
      - the org name and time, if those options are on
   3. If the logo is shown, `await img.decode()` with a 2 s timeout. If decoding fails or times out, hide the logo and print anyway.
   4. `await frameDoc.fonts.ready`, then wait two `requestAnimationFrame` ticks so layout settles.
   5. Call `frame.contentWindow.print()` inside try/catch. Do not call `focus()` first. With `--kiosk-printing`, Chrome sends the job to the default printer with no dialog, and `print()` returns once printing has been handed off.
   6. The job is done when `print()` returns, or when the frame's `afterprint` fires, whichever comes first. Guard against finishing twice.
   7. Restore focus (section 5). Dispatch `window.dispatchEvent(new CustomEvent("kiosk:ticket-printed", { detail: { queueNumber, name } }))` for tests.
   8. On any exception or timeout, call `onPrintFailed(queueNumber)`. If the card on screen is still that success, it switches to the print-failure text. Log the error to the console.
4. When the job is done, clear `printing`, wait 500 ms, and run the next job.

The page is never reloaded (see "After printing" for the fallback tied to R1).

## 7. Data

All shapes come from `src/lib/contracts/`. The UI imports the schemas and types and never redefines them. `scan-api.ts` validates every response with the contract's zod schema.

| Screen part | Reads / writes | Contract | Provider |
|---|---|---|---|
| `KioskData` (server) | kiosk settings | `KioskSettings` from `src/lib/contracts/settings.ts` | `getKioskSettings()`, falling back to `getDefaultKioskSettings()`, from `@/server/services/settings` |
| `KioskData` (server) | today's log, initial | `TodayAttendanceResponse` from `src/lib/contracts/attendance.ts` | `getTodayAttendance()` from `@/server/services/attendance` |
| Scan controller (client) | writes a scan | `scanRequestSchema` / `ScanRequest` and `scanResponseSchema` / `ScanResponse` from `src/lib/contracts/scan.ts` | `POST /api/scan` |
| Today log (client) | refresh and poll | `TodayAttendanceResponse` | `GET /api/attendance/today` |
| Ticket | none (uses the success response) | `ScanResponse` (success branch) | none |

Props from `KioskData` to `KioskScreen` (all serializable):
`{ settings: KioskSettings, initialLog: TodayAttendanceResponse | null }`

`KioskSettings` is `{ org_name, camera_enabled, ticket: { show_logo, show_org_name, show_scan_time }, timezone }`.

## 8. Camera hook API (`use-qr-camera.ts`)

```
useQrCamera(options: {
  enabled: boolean;          // settings.camera_enabled
  paused: boolean;           // inflight || locked; the detect loop idles, the stream keeps running
  onDetect: (code: string) => void;
  intervalMs?: number;       // default 150 (about 6–7 detections/s on a low-end PC)
}): {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: "loading" | "starting" | "running" | "denied" | "no-camera" | "in-use" | "insecure" | "error";
  retry: () => void;         // used internally by the auto-retry timers; exposed for tests
}
```

Behavior:
- **The decoder** comes from `zxing.ts` `getDetector()`. That is a module-level promise that:
  - calls `prepareZXingModule({ overrides: { locateFile: (p) => p.endsWith(".wasm") ? "/zxing/zxing_reader.wasm" : p } })` once
  - then builds `new BarcodeDetector({ formats: ["qr_code"] })` from the ponyfill entry, so the global object isn't patched
  - is pre-warmed when `camera-preview` mounts
  - If the promise rejects, status becomes `error`.
- **Start.** Each effect run owns a local `cancelled` flag.
  1. Check that `navigator.mediaDevices?.getUserMedia` exists; if not, status is `insecure`.
  2. Call `getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })`. A desktop webcam has no meaningful `facingMode`, so none is set.
  3. When it resolves:
     - If `cancelled` is set, stop every track and return.
     - Otherwise set `video.srcObject = stream` and `await video.play()`. The video is `muted` and `playsInline`.
     - Set status to `running`.
- **Detect loop:**
  - A `setTimeout` chain, not `requestAnimationFrame`, so there is never more than one `detect()` at a time.
  - Each tick: if not `cancelled`, not `paused`, `!document.hidden` and `video.readyState >= 2`, then `await detector.detect(video)`.
  - On a hit, take the first `rawValue`, trim it, and call `onDetect` if it is non-empty.
  - Schedule the next tick only after the await settles.
  - `onDetect` is read through a ref, so changing callbacks don't restart the stream.
- **Cleanup** (unmount, `enabled` turning false, or StrictMode's dev unmount):
  - Set `cancelled = true` and clear the loop timeout.
  - Stop every track of the stream if one exists, whatever the status. This covers stop-before-start: a `getUserMedia` that resolves after cleanup stops its own tracks in step 3.
  - Set `video.srcObject = null`.
  - Remove the `devicechange` listener and the retry timers.
- **Error mapping:**
  - `NotAllowedError`: `denied`
  - `NotFoundError` or `OverconstrainedError`: `no-camera`
  - `NotReadableError` or `AbortError`: `in-use`
  - `SecurityError`: `insecure`
  - anything else: `error`
  - Retry policy is in the camera states table (section 4). Retries re-run start with a fresh `cancelled` flag.
- **Preview.** The `<video>` uses `object-cover` and is mirrored with CSS `scale-x-[-1]`, which feels natural for a front-facing webcam. Detection reads the unmirrored frames. A corner-bracket overlay marks the target area. It is decoration only; the whole frame is scanned.
- **Duplicates** from a card held in view are handled by the controller: the lock, the 10 s same-code rule, and the server cooldown. The hook does not de-duplicate.

## 9. shadcn/ui components to add

shadcn is not initialized yet (there is no `components.json`). Run init first, then add:
`card`, `badge`, `alert`, `table`, `skeleton`, `progress`, `separator`

## 10. Contract dependencies

These are the approved contracts in `src/lib/contracts/` (`common.ts`, `scan.ts`, `attendance.ts`, `settings.ts`). Import the schemas, types and helpers from them, and never redefine them. Field names below are the contract's.

**`src/lib/contracts/common.ts`**
- `parseLocalDateTime(value)`: splits a `LocalDateTime` (`"YYYY-MM-DD HH:MM:SS"`, 24-hour wall-clock time in APP_TIMEZONE, no offset) into numbers. `formatScanTime` uses it to render `h:mm AM` with no timezone conversion. Never pass these strings to `new Date()`.
- `apiErrorSchema`: `{ status: "error", code, message }`. `code` is one of `invalid_request`, `db_unavailable`, `busy` or `server_error`, and `message` is always present.

**`src/lib/contracts/scan.ts`**
- `scanRequestSchema` / `ScanRequest`: `{ code: string }`, max `SCAN_CODE_MAX_LENGTH` (1024). The UI's 64-character buffer cap is stricter, which is fine. `scanRequestSchema.safeParse` is the client-side validation in section 5.
- `scanResponseSchema` / `ScanResponse`: a discriminated union on `status`. Parse every `/api/scan` body with it, whatever the HTTP status.
  - `success`:
    - `queue_number`, printed and shown
    - `scanned_at` (`LocalDateTime`), shown as `h:mm AM`, and printed when `ticket.show_scan_time` is on
    - `employee.full_name`, the name shown on the card and printed on the ticket (it can be empty; the ticket then prints "Employee")
    - `employee.employee_id` and `employee.position`, shown on the card
    - `message`, parsed but not displayed
    - `queue_date`, not used by the UI
  - `duplicate`:
    - `message`, shown verbatim
    - `last_scanned_at` (`LocalDateTime`), shown as "Last scanned h:mm AM"
    - `employee.full_name`, `employee.employee_id` and `employee.position`, shown on the card
    - `cooldown_ends_at` and `retry_after_minutes`, parsed but not displayed separately (the server's `message` already contains the minutes)
  - `failed`: `message`, shown verbatim
  - `error` (`apiErrorSchema`): `message`, shown verbatim. `code` is not displayed. The UI's own fallback text, "Server error. Please try again, or ask HR for help.", is used only when the body is not JSON or fails `scanResponseSchema`.
- **HTTP status codes** (200/404/429/400/500/503) are not relied on. `status` in the body is.

**`src/lib/contracts/attendance.ts`** (today's log)
- `todayAttendanceResponseSchema` / `TodayAttendanceResponse`: `{ date, timezone, generated_at, entries }`.
  - `date` (`LocalDate`): the server's today in APP_TIMEZONE, used for the log header and rollover.
  - `timezone` and `generated_at`: parsed, not displayed.
  - `entries`: `AttendanceEntry[]`, newest first.
- `AttendanceEntry`:
  - `id`, used as the React key
  - `employee_id` and `name` (each an empty string for legacy NULL rows, which shows "No ID" and "Unknown employee"), plus `position`
  - `queue_number`
  - `scanned_at` (`LocalDateTime`), shown as `h:mm AM`
- **`GET /api/attendance/today`** takes no query parameters. A non-2xx response has an `apiErrorSchema` body.

**`src/lib/contracts/settings.ts`** (from the server service, not an API)
- `KioskSettings`: `org_name`, `camera_enabled`, `ticket.show_logo`, `ticket.show_org_name`, `ticket.show_scan_time` and `timezone` (APP_TIMEZONE, for the clock's `Intl.DateTimeFormat`).

**Services** called by `kiosk-data.tsx` after `await connection()`:
- `getKioskSettings(): Promise<KioskSettings>` from `@/server/services/settings`. It rejects when the database is down.
- `getDefaultKioskSettings(): KioskSettings` from `@/server/services/settings`. It is synchronous and never touches the database. Use it in the `catch`.
- `getTodayAttendance(): Promise<TodayAttendanceResponse>` from `@/server/services/attendance`. It rejects when the database is down; the page then passes `initialLog: null`.

## 11. Needs from backend

1. **`date` in the today-log response.** The old endpoint returned a bare array, so the kiosk had to guess "today" from the browser. The UI needs the server's date for the header and for rollover.
2. **Service functions for the Server Component:** one that returns the kiosk settings (`org_name`, `camera_enabled`, ticket options) and the effective `APP_TIMEZONE`, and one that returns today's log in the same shape as the API. The UI needs their names and import paths, and must know what they throw when the database is down. The UI catches anything they throw.
3. **Ticket options.** The plan expects three booleans, all defaulting to false: `show_logo`, `show_org_name`, `show_scan_time`. If the backend defines a different set, tell the UI. The ticket supports only what the setting provides.
4. **`GET /api/attendance/today` must never be cached.** It needs `Cache-Control: no-store` and must be dynamic under `cacheComponents`. Its response must carry the standard HTTP `Date` header, which the clock uses for its offset.
5. **A body that matches the contract on every error path of `POST /api/scan`,** including a malformed body (400) and an internal error (500). The `error` variant must carry a `message` safe to show on the kiosk (no stack traces or SQL).
6. **A note on timeouts.** The kiosk aborts after 10 s. The server transaction may still commit, in which case the scan is recorded but no ticket prints. The admin reprint (step 5) covers this. The backend should keep the scan transaction well under 10 s, with a lock wait timeout lower than the default 50 s.

## 12. Acceptance checks

### Playwright checks (the ui-implementer runs these in the browser on http://localhost:3000)

Setup for every check:
- Viewport 1366×768. Repeat checks 1, 3 and 5 at 1920×1080 and take screenshots.
- Use `page.route` (Playwright MCP `browser_run_code`, or a spec file) to stub `/api/scan` and `/api/attendance/today` with contract-valid bodies when the backend isn't ready or a state is hard to produce.
- Stub printing with `page.addInitScript` so that in every frame `window.print` is replaced by a function that records `document.querySelector(".number")?.textContent` and `.name` on `window.top.__prints`. Also listen for `kiosk:ticket-printed`.
- Simulate the USB scanner with `page.keyboard.type("EMP-0012", { delay: 10 })` then `page.keyboard.press("Enter")`, with nothing focused. Don't click the page first.

1. **Idle.** `/` loads, showing the logo, the org name, a ticking clock (it changes within 2 s), "Ready to scan", "Waiting for QR code" and "Ready for the next scan". Check that `document.activeElement === document.body`. Disable the network in DevTools: the page makes no request to a host other than localhost (also check the font and logo requests).
2. **Success.** A scanner burst gives:
   - the "Scan successful" card, the "Attendance recorded" badge, the queue number, the name, `EMP-0012 • position • h:mm AM`, and "Please take your printed ticket."
   - exactly one entry in `__prints`, with the right number and name
   - a log refresh: a new row at the top, highlighted
   - the strip reads "Please wait", then "Ready for the next scan" about 2.5 s after the response
   - the card returns to idle about 6 s after it appeared
   - no page reload (a `window.__marker` set before the scan survives)
3. **Duplicate.** The stub returns `duplicate`. The page shows "Duplicate scan", "Already recorded", the server message verbatim, and "Last scanned h:mm AM". Nothing is printed. The log refreshes.
4. **Failed.** The stub returns `failed`. The page shows "Scan failed", "Action required", and "QR code not recognized. Ask your admin to register you." Nothing is printed. No log request is made.
5. **Server error.** First stub a 500 with `{ status: "error", message: "X" }`: the page shows "Scan failed" and "X", and no banner. Then stub a 500 with an HTML body: the page shows "Server error. Please try again, or ask HR for help." and no banner.
6. **Unreachable.** `route.abort()` on `/api/scan` gives "Cannot reach the server. Check your connection and try again." and the banner "Server unreachable. Scans are not being recorded. Retrying…". Aborting `/api/attendance/today` as well keeps the banner up. Removing the abort clears the banner within about 5 s.
7. **Timeout.** Delay `/api/scan` by 11 s. "Checking your ID…" appears after about 300 ms, and the unreachable card appears at about 10 s.
8. **Guard.**
   - Delay `/api/scan` by 1 s and send two different codes 200 ms apart: only one request is made, and "Please wait a moment, then scan again." shows.
   - Send a second, different code 1 s after the response: no request is made.
   - Send it 3 s after the response: a request is made.
9. **Same code.** After a success, scan the same code again at 4 s. No request is made, and the success card stays. After a failed result, the same code at 3 s is sent.
10. **Typing vs scanner.** Typing "EMP-0012" with `delay: 400` then Enter makes no request. Pressing Enter on its own makes no request. Ctrl+R is not blocked (only check that the handler doesn't call `preventDefault`).
11. **Print queue.** Stub `print` so it blocks for 1.5 s (a busy-wait). Send two successes about 2.6 s apart. `__prints` gets 2 entries, in order, never overlapping (the second starts after the first returns plus 500 ms).
12. **Print failure.** Stub `print` to throw. The success card shows "The ticket could not be printed. Please ask HR to reprint it." and stays about 10 s.
13. **Focus after print.** After check 2, without clicking, send another code (after the lock). It is submitted. `document.activeElement` is `body`, not the iframe.
14. **Log.**
    - An empty stub shows "No scans recorded yet".
    - A stub with 150 rows shows "150 scans" and renders at most 100 rows.
    - A 20 s poll is visible in the network log.
    - Changing the stub's `date` triggers a `router.refresh()` (an RSC request in the network log), and the rows are replaced.
15. **Initial load with the database down.** Point the server at a missing DB, or have the service throw in dev. The page still renders: shell, then screen with defaults, then the banner, with no error page.
16. **Camera** (needs Chromium with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<qr.y4m>`, or skip and report it):
    - With `camera_enabled` false, no request is made for `/zxing/zxing_reader.wasm` or the camera chunk.
    - With it true:
      - the wasm loads from same-origin `/zxing/zxing_reader.wasm` with `Content-Type: application/wasm`
      - the fake QR stream submits once, and doesn't submit again within 10 s
      - permission denied (`context.clearPermissions()` with no grant) shows "Camera not available" plus the denied text, while USB scans still work
    - In dev (StrictMode) after mount, `chrome://media-internals` or `getUserMedia` call counting shows one live video track, not two.
17. **No focusables.** Pressing Tab repeatedly never focuses anything (the "Admin" link has `tabIndex=-1`).

### On the real kiosk (main session or HR, not Playwright)

- **R-print-1.** A ticket prints at 80 mm with no dialog. The number and name are fully inside the printable area, with nothing cut off at the edges. The paper feed length is sensible, not an A4-length blank.
- **R-print-2.** Ten different employees scan back to back at about 3 s intervals. Ten tickets print, in order, with the page never reloading. This checks R1 throttling.
- **R-print-3.** After 30 minutes idle and then 50 scans across a morning, the page is still responsive: no leaked iframes (DevTools Elements shows exactly one ticket iframe) and no growing memory.
- **R-scan-1.** The real USB scanner model works. Check the inter-key gap is under 300 ms, check the suffix is Enter (not Tab), and check that IDs with letters come through with the right case under the kiosk's Windows keyboard layout.
- **R-camera-1 (required before `camera_enabled` defaults to true).** On the actual kiosk webcam, under normal lighting:
  - scan 20 real ID cards, including the most worn ones, at the distances people naturally hold them
  - record the decode success rate and the time to decode
  - confirm that USB scanning still works while the camera runs, and that CPU stays reasonable on the kiosk PC (Task Manager)
  - unplug and replug the webcam: the `no-camera` state appears, then it recovers
  - open the Windows Camera app at the same time: the `in-use` state appears, then it recovers after closing the app

  Until this passes, `camera_enabled` stays false by default.

## 13. Implementation checklist (in order)

1. **Prerequisites the main session handles, outside the implementer's file scope:**
   - `npm install barcode-detector` with the exact version pinned, which also brings `zxing-wasm`
   - shadcn init, which writes `components.json` and touches `package.json` and `globals.css`
   - the backend contracts present in `src/lib/contracts/`
2. **WASM.** Copy `node_modules/zxing-wasm/dist/reader/zxing_reader.wasm` to `public/zxing/zxing_reader.wasm`. Check its SHA-256 against the package's exported hash constant (see R3), and note the zxing-wasm version and hash in the implementer's report.
3. **Cleanup and root layout:**
   - Delete `src/app/page.tsx` and the unused starter SVGs.
   - Update `layout.tsx`: the metadata title, keep Geist, light theme only.
   - Run shadcn init and add the components from section 9.
4. **Pure helpers:** `format.ts` (time, clock and name formatting, with unit-style checks in the report) and `scan-api.ts` (fetch with timeout and contract parsing).
5. **Scanner and controller:**
   - `use-scanner-input.ts`
   - `use-scan-controller.ts`, the reducer from section 5
   - a temporary bare result display, then Playwright checks 2–10 against stubs
6. **Stage UI:** `scan-stage.tsx`, `idle-prompt.tsx`, `result-card.tsx`, the ready strip and `offline-banner.tsx`, styled per sections 3 and 4.
7. **Log:** `use-today-log.ts` and `today-log.tsx`, with polling, the highlight and rollover with `router.refresh()`. Check 14.
8. **Header and footer:** `kiosk-header.tsx`, `kiosk-clock.tsx` with the server offset and timezone, and `kiosk-footer.tsx`. Also `use-hide-idle-cursor.ts`.
9. **Printing:** `ticket-template.ts` and `use-ticket-printer.ts`, then the focus restore and the safety net. Checks 2, 11, 12 and 13.
10. **Server side:** `(kiosk)/page.tsx`, `kiosk-data.tsx` (`connection()`, services, the error fallback), `kiosk-shell.tsx` and `error.tsx`. Checks 1 and 15. `npm run build` must pass with no database reachable at build time.
11. **Camera:** `zxing.ts`, `use-qr-camera.ts`, `camera-preview.tsx` and `camera-panel.tsx` (dynamic, `ssr: false`). Check 16.
12. **Final pass:**
    - lint, `tsc --noEmit` and build
    - the full Playwright list at both resolutions, with screenshots of idle, idle with the camera, submitting, success, success with a print failure, duplicate, failed, error and unreachable
    - report which real-kiosk checks are still outstanding

## 14. Open questions

### For the ui-researcher (facts, don't guess)

- **R1.** In Chrome on Windows with `--kiosk --kiosk-printing`, does Blink throttle repeated `window.print()` calls from the same page or iframe ("Ignoring too frequent calls to print()")? What are the limits, and does a navigation or reload reset them? Does `print()` block until the job is spooled, and does `afterprint` fire in kiosk-printing mode?
- **R2.** Does Chrome honour `@page { size: 80mm auto }`, which is not valid by the CSS spec, or fall back to the driver's default paper? What is the recommended `@page` rule for an 80 mm roll on common Windows thermal drivers (for example XP-80 or EPSON TM-T82), to avoid long blank feeds and edge clipping (printable width is about 72 mm)?
- **R3.** For `barcode-detector` 3.2.x:
  - the exact import path for the ponyfill (non-global) `BarcodeDetector`
  - whether `prepareZXingModule` is re-exported from that entry
  - whether the reader or the full wasm is loaded by default
  - which file `ZXING_WASM_SHA256` refers to
  - whether TypeScript types resolve through the exports map
  - whether `detect()` accepts an `HTMLVideoElement` directly in the polyfill
- **R4.** Does the Next.js 16 standalone server serve `public/*.wasm` with `Content-Type: application/wasm`, as `WebAssembly.instantiateStreaming` requires? If not, does zxing-wasm fall back to `instantiate`?
- **R5.** What is the supported way to pre-grant camera permission for `http://localhost:3000` in the kiosk's dedicated Chrome profile (enterprise policy `VideoCaptureAllowedUrls`, a launch flag, or a profile preference), so no permission prompt ever needs a click? This affects `packaging/Start-Kiosk.ps1`, which the backend-implementer owns.

### Decisions for the user (approved 2026-11-18)

The user approved every default below as written. Question 13 is answered.

1. **No reload after printing.** The success card stays 6 s. If R1 shows Chrome throttles prints, the fallback is to reload when the card clears.
2. **The "Print receipt" button and dialog are removed from the kiosk.** Reprints happen only in admin. If printing fails, the card says "The ticket could not be printed. Please ask HR to reprint it."
3. **The kiosk's Login button and modal are replaced** by a small "Admin" link in the footer that goes to `/admin` (a mouse click only, never focusable).
4. **A scan dropped by the 2.5 s guard now shows "Please wait a moment, then scan again."** The old app dropped it silently.
5. **New rule: the same code within 10 s of a success or duplicate is ignored.** The card stays up instead of flipping to "Duplicate scan". This applies to both the scanner and the camera.
6. **Typed IDs are accepted** if typed with under 300 ms between keys and then Enter, the same as the old app. Should manual typing be blocked instead?
7. **The log shows each employee's queue number instead of a row index.** It stays public, with names, IDs and positions, the same as the old app. It polls every 20 s for scans from other kiosks.
8. **The duplicate card says "Last scanned"** instead of the old "First scanned". The time shown was always the most recent scan.
9. **The ticket stays exactly as it was** (number and name, Arial), with the logo, org name and scan time as optional settings that are off by default.
10. **Clock and dates use a 12-hour en-PH format** in `APP_TIMEZONE`, for example "8:05:12 AM" and "Wednesday, November 18, 2026".
11. **The scan request times out at 10 s and shows "Cannot reach the server…".** If the server commits late, no ticket prints and HR reprints it.
12. **Settings changes reach a running kiosk at the next midnight rollover, or when someone presses F5.** The kiosk doesn't poll settings.
13. **The camera only works at `http://localhost:3000`.** Browsers block cameras on plain-HTTP LAN addresses. Will any kiosk open the app through another PC's IP address? **Answered:** there is one kiosk, and it uses `http://localhost:3000`, so the camera's secure-context requirement is met.
14. **No sound on scan results**, the same as the old app. Add a success or failure beep?
