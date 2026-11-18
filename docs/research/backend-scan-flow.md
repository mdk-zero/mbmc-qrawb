# Old app scan flow (`../mbmc-qras`)

Research for the Next.js rewrite. Question: how the old Express + React/Vite app handles a QR scan from the kiosk submitting an employee ID to the response the kiosk shows.

Date of research: 2026-11-18. Old app read-only. No database queries were run.

## Source versions analysed

- **Working tree (what I analysed):** `/home/mdk0/Projects/mbmc-qras/server.js`, `schema.sql`, `client/src/pages/Scanner.jsx`, `client/src/utils/printReceipt.js`, `README.md`. These are uncommitted edits relative to git HEAD.
- **Git HEAD** (commit `90924a78`, "first commit"; later commit `34684acb` "print") differs on the scan path:
  - `COOLDOWN_MIN = 10` at HEAD `server.js:18` (working tree: `server.js:16`, value `180`).
  - HEAD `server.js:551-560` inserts a `department` column and no `queue_number`. The working tree dropped `department` and added `queue_number`.
  - HEAD `server.js:10-15` destructures `const { DB_HOST = DB_HOST, ... } = process.env;`, which is a self-referencing default (temporal dead zone). Working tree replaced it with `process.env.X || default`.
  - Check `git -C /home/mdk0/Projects/mbmc-qras diff` before relying on any line number. The build is newer than the source (`client/dist` Nov 14 15:00, `Scanner.jsx` Nov 14 14:36, `server.js` Nov 13 09:59), so the `dist` bundle probably reflects the working tree.
- **Built client** `client/dist/assets/index-MJBadjmI.js` contains the same user-visible strings as the working-tree source (checked by grep: "Duplicate scan", "Cannot reach the server", "Receipt printing could not start automatically", `6e3` dwell, `2500` busy lock).

## Short answers

1. **Endpoint:** `POST /api/scan`, JSON body `{ "code": "<string>" }`, no auth. Responses: 200 `success`, 429 `duplicate`, 404 `failed`, 500 `{error:"Server error."}`.
2. **Input:** the server only trims. No case folding, no numeric check, no length limit (other than the 8 mb global JSON body cap).
3. **Lookup:** `SELECT * FROM users WHERE employee_id=? FOR UPDATE`. There is no active/disabled state. A user either exists or does not.
4. **"Today":** MySQL `CURDATE()` and `NOW()` run in the MySQL session time zone, which the app never sets. Node's `TZ` and `APP_TIMEZONE` are not used. The attendance list default date uses UTC (bug).
5. **Cooldown:** 180 minutes in the working tree (10,800 seconds). It compares against the employee's most recent scan of any date. A duplicate returns HTTP 429 and no queue number. **Conflict:** `README.md:30` says 10 minutes.
6. **Scan types:** none. Every accepted scan is just a row in `attendance`. No time-in or time-out type, and no per-day limit beyond the cooldown.
7. **Queue:** `daily_queue` row per `queue_date`, incremented inside the scan transaction. Rolled-back scans do not consume numbers. Repeat scans in the cooldown get no number. Same-employee scans are serialized by the `users` row lock. Cross-employee scans are serialized by the `daily_queue` row lock. Midnight boundary race described below.
8. **Writes:** 4 statements inside one transaction, plus reads. The transaction is `BEGIN` ... `COMMIT` on success and `ROLLBACK` on unknown or duplicate.
9. **Messages:** 4 server messages, plus several client-built messages. See the table in section 9.
10. **Ticket:** printed only when `status === "success"`. The response carries `queue_number` and the employee's first and last name. The client builds the ticket text and calls the browser's print on an iframe.
11. **Quirks:** listed in section 11.

---

## 1. Endpoint

| Item | Value | Citation |
|---|---|---|
| Method and path | `POST /api/scan` | `server.js:539-540` |
| Auth | None. Not wrapped in `auth`. | `server.js:539-541` |
| Body parser | Global `express.json({ limit: "8mb" })`. Body is only parsed when `Content-Type` is JSON, otherwise `req.body` is `{}` (Express 4.22.3). | `server.js:21`; `node_modules/express/package.json` |
| Request body read | `String(req.body.code || "").trim()` | `server.js:542` |
| Error wrapper | `wrap(fn)` catches anything thrown, logs it, and responds `e.status || 500` with `{error: e.status ? e.message : "Server error."}` | `server.js:98-104` |
| Route ordering | `/api/scan` is registered before the SPA fallback and the `/api` 404 catch-all, so those never see a scan request. | `server.js:539`, `715-719` |

Response shapes. The kiosk reads the `status` field, not the HTTP code, for the three business outcomes.

| HTTP | Body | Condition | Citation |
|---|---|---|---|
| 200 | `{ status:"success", user:{employee_id, first_name, last_name, position}, queue_number, scanned_at, message:"Attendance recorded." }` | Scan accepted and committed | `server.js:614-620` |
| 429 | `{ status:"duplicate", user:{employee_id, first_name, last_name, position}, scanned_at, message }` | Last attendance row is less than the cooldown old | `server.js:578-583` |
| 404 | `{ status:"failed", message:"QR code not recognized. Ask your admin to register you." }` | No `users` row for the trimmed code | `server.js:557-560` |
| 500 | `{ error:"Server error." }` (no `status` field) | Any uncaught exception, including DB down and the midnight race | `server.js:100-103` |
| 400 (HTML) | Express default HTML error page | Malformed JSON body, or body over 8 mb. Thrown by body-parser before the route runs. `next(createError(400, ...))` with type `entity.parse.failed` (`node_modules/body-parser/lib/read.js:129-134`). The response is HTML from finalhandler (`node_modules/finalhandler/index.js:299`). Not in app code. | inferred from body-parser and finalhandler source; not run |

Notes:
- `user` in the 200 and 429 bodies does not include the database `id`.
- `scanned_at` on 200 is `SELECT NOW()` after the insert, formatted as a string (see section 4).
- `scanned_at` on 429 is the stored `attendance.scanned_at` of the most recent scan, as a string.

## 2. Input handling

| Aspect | Behaviour | Citation |
|---|---|---|
| Source of `code` | `req.body.code` from the JSON body. Ignores query string and headers. | `server.js:542` |
| Coercion | `String(req.body.code \|\| "")`. Falsy values (`null`, `undefined`, `0`, `false`, `""`) become `""`. Numbers, booleans and objects become strings (for example `{}` becomes `"[object Object]"`). | `server.js:542` |
| Trimming | JS `String.prototype.trim()` on the server. The client also trims keyboard input. | `server.js:542`; `Scanner.jsx:537` |
| Case | Not changed by app code. Matching depends on the database collation. `schema.sql` does not set a collation (`schema.sql:5`). See "unverified" below. | `schema.sql:3-12` |
| Empty input | Server: `""` goes to the lookup and returns 404 (the admin and bulk paths reject empty IDs, so no row is normally stored with an empty ID). Keyboard client: an empty buffer is never sent (`if (code) submit(code)`). Camera client (dead code, see section 11): no empty check. | `server.js:542`, `Scanner.jsx:537-540`, `Scanner.jsx:493` |
| Non-numeric or malformed | No check. Any string is looked up, and an unknown string gets 404. The app treats employee IDs as free text. The admin create path checks only non-empty (`server.js:290-298`). The bulk import trims and checks non-empty (`server.js:187`, `223`, `241`). | `server.js:290-298`, `server.js:238-251` |
| Length | No limit in the scan path. Body is capped at 8 mb by Express (`server.js:21`). `users.employee_id` is `VARCHAR(50)` (`schema.sql:5`), so longer values can never match a stored row. | `server.js:21`, `schema.sql:5` |
| Client-side input source | Keyboard (USB scanner or typing): listener on `document` in capture phase. Only single-character `event.key` values are buffered. The buffer resets after a 300 ms gap. Enter submits the trimmed buffer. Events from INPUT, TEXTAREA, SELECT or contentEditable are ignored. | `Scanner.jsx:517-544` |
| Client-side camera input | `html5-qrcode` passes decoded text to `submit` without trimming. This path does not run (see section 11). | `Scanner.jsx:486-494` |

Unverified: whether `employee_id=?` is case-insensitive or accent-insensitive. This depends on the database collation. Typical defaults (MySQL 8 `utf8mb4_0900_ai_ci`, MariaDB `utf8mb4_general_ci`) are case-insensitive, and the `ai` collation is also accent-insensitive. The collation was not checked against a live database. The same collation governs the `UNIQUE` constraint on `employee_id` (`schema.sql:5`), so `ABC` and `abc` cannot both exist under a `_ci` collation.

## 3. Employee lookup

Query (inside the transaction, first statement after `BEGIN`):

```
SELECT * FROM users WHERE employee_id=? FOR UPDATE   -- param: code
```

Citation: `server.js:550-553`.

- Not found: `ROLLBACK`, then 404 (`server.js:554-560`).
- Found: `person` is built from `employee_id`, `first_name`, `last_name`, `position` (`server.js:563-568`). `photo_filename`, `email` and `created_at` are not sent to the kiosk.
- Disabled or inactive: **not in the old app.** `schema.sql:3-12` has no status column. `server.js` has no `active` or `disabled` check. The only user states are "exists" and "deleted".
- Deleted users: `DELETE /api/users/:id` runs `DELETE FROM users WHERE id=?` (`server.js:503-511`). The `attendance` foreign key is `ON DELETE CASCADE` (`schema.sql:22`), so a deleted employee's whole attendance history is removed.
- `FOR UPDATE` on an unknown ID: under InnoDB REPEATABLE READ this can take a gap lock on the `users` unique index, which may briefly block inserts into that gap. Not observed or measured.

## 4. "Today": time and date handling

Every date or time that drives the scan is computed by MySQL, not by Node:

| Use | SQL | Citation |
|---|---|---|
| Cooldown age | `TIMESTAMPDIFF(SECOND, scanned_at, NOW()) AS ago` | `server.js:570` |
| Queue date | `CURDATE()` (three places) | `server.js:588`, `594`, `597` |
| Stored scan time | `NOW()` in the `INSERT` | `server.js:601` |
| Response scan time | `SELECT NOW() AS now`, a separate statement after the insert | `server.js:610`, `618` |

Facts from the code:
- **Session time zone.** The app never sets `time_zone` (grep for `time_zone` and `SET` finds nothing in `server.js`). The MySQL session therefore uses the server's default time zone, which is normally the OS time zone of the machine running MySQL. **Unverified** for the kiosk: the actual `@@global.time_zone` and `@@session.time_zone` were not queried.
- **Node process time zone.** Not used for any scan decision. The `mysql2` pool has no `timezone` option, so it defaults to `'local'` (`node_modules/mysql2/lib/connection_config.js:142`). This only affects JS `Date` conversions. The pool sets `dateStrings: true` (`server.js:851`), so `DATETIME` values come back as plain strings and are not converted in JS.
- **No `APP_TIMEZONE`.** The old app has no such variable (grep found none). The rewrite's `APP_TIMEZONE` rule has no equivalent here.
- **Browser clock.** The scan decision never uses the browser. But the kiosk's daily log list does: `getLocalDateKey()` builds the date from the browser's `Date` (`Scanner.jsx:92-97`) and sends it as `?date=` (`Scanner.jsx:380-383`). If the browser's time zone differs from the MySQL session's, the list can show a different day from the one the scans were written to.
- **UTC default (bug).** `GET /api/attendance/today` falls back to `new Date().toISOString().slice(0, 10)` when no `date` is given (`server.js:633-636`). That is the UTC date. Between 00:00 and 08:00 in Asia/Manila the default day is yesterday. The kiosk always passes `date`, so it does not hit this default.
- **Timestamp precision.** `DATETIME` has no fractional seconds. The stored `scanned_at` (`server.js:601`) and the response `scanned_at` (`server.js:610`) come from different statements, so they can differ by one second if a second boundary passes between them.
- **Clock going backwards.** `ago` can be negative. It is then `< 10800` and is treated as a duplicate, with `wait = 10800 - ago` greater than 180 minutes (`server.js:574`, `577`).

## 5. Cooldown and duplicate scans

- Constant: `COOLDOWN_MIN = 180` (`server.js:16`). Used as `COOLDOWN_MIN * 60` = 10,800 seconds (`server.js:574`).
- Comparison: `last.ago < COOLDOWN_MIN * 60`, where `last` is the latest row in `attendance` for this user (`server.js:569-574`). So a scan exactly 10,800 seconds after the last one is accepted (strict `<`).
- Basis: the most recent scan of **any date** for that user (`ORDER BY scanned_at DESC LIMIT 1`, no date filter). Cross-day cooldown is therefore possible, for example a scan at 23:00 followed by one at 02:00 the next day is blocked.
- Units: whole seconds. `TIMESTAMPDIFF` truncates to whole seconds (`server.js:570`).
- Index: `INDEX (user_id, scanned_at)` (`schema.sql:21`) supports the lookup.
- Message: `Duplicate scan. Already recorded — try again in ${Math.ceil(wait / 60)} min.`, where `wait = 10800 - ago` (`server.js:577-582`). The dash is an em dash (U+2014).
- Response: HTTP 429, `status:"duplicate"`, `user`, `scanned_at` (the stored time of the last scan), `message`. No `queue_number`. Nothing is written (`ROLLBACK`, `server.js:575-576`).
- Kiosk: shows the duplicate card (section 9). It does not print. It refreshes the today list (`Scanner.jsx:397-399`). The card label is "First scanned" (`Scanner.jsx:338`), but the time shown is the most recent scan. In practice these are the same row, because accepted scans are always at least the cooldown apart.
- Conflict within the working tree: `README.md:30` says "Cooldown is 10 minutes". `server.js:16` says 180. HEAD `server.js:18` says 10. **The rewrite must pick one value. Confirm with the user before the plan is written.**

## 6. Scan types

- The `attendance` table has no type, direction or status column (`schema.sql:13-23`). Columns: `id, user_id, employee_id, name, position, queue_number, scanned_at`.
- There is no time-in or time-out alternation. Every accepted scan is just logged.
- Per-day limit: none, apart from the cooldown. Scans at least 3 hours apart can each be accepted, so one person can have several accepted scans on the same date. Each gets its own queue number.

## 7. Queue numbers

Structure (`schema.sql:24-27`):

```
CREATE TABLE IF NOT EXISTS daily_queue (
  queue_date DATE PRIMARY KEY,
  last_number INT NOT NULL
);
```

- Assignment: three statements inside the scan transaction (`server.js:586-598`):
  1. `INSERT ... VALUES (CURDATE(), 0) ON DUPLICATE KEY UPDATE last_number=last_number` creates today's row if it does not exist. The no-op update is intentional.
  2. `UPDATE daily_queue SET last_number=LAST_INSERT_ID(last_number + 1) WHERE queue_date=CURDATE()` increments the counter. `LAST_INSERT_ID(expr)` also sets the connection's last-insert-id value, which nothing reads afterwards.
  3. `SELECT last_number AS queue_number FROM daily_queue WHERE queue_date=CURDATE()` reads the new value. This read is in the same transaction, which holds the row lock from step 2, so it sees the transaction's own update.
- Reset: none needed. The key is the date, so each `CURDATE()` starts a new sequence from 1.
- Repeat scan: the cooldown check (section 5) runs before step 1, so a duplicate never increments the counter and gets no number. The 429 body has no `queue_number`. The earlier number is not returned.
- Rejected scans: the 404 path also rolls back before step 1, so it does not consume a number.
- Rollback: because the increment is in the transaction, a failed scan after step 2 (for example a failure in the `attendance` insert) rolls back the counter. No gap is left.
- Stored value: `attendance.queue_number` is written from step 3 (`server.js:607`). There is no unique key on `(queue_date, queue_number)`. Uniqueness depends only on the `daily_queue` row lock.

### Concurrency

| Scenario | What happens | Citation |
|---|---|---|
| Two scans for the same employee at once | The second `SELECT ... FOR UPDATE` on `users` blocks until the first commits. Its cooldown `SELECT` then sees the first row (the read view is created after the lock) and returns 429. Correct. | `server.js:550-553`, `569-574` |
| Two scans for different employees at once | Both reach step 2 on the same `daily_queue` row. The second waits until the first commits (row lock held to `COMMIT`), so numbers are sequential and gap-free. All scans in the building are serialized at this point. | `server.js:591-595` |
| First scan of a new day, concurrent | Both `INSERT ... ON DUPLICATE KEY` statements succeed, one inserting and one updating a no-op. The primary key makes this safe. | `server.js:586-590` |
| Midnight boundary (race) | `CURDATE()` is evaluated in each statement separately. If the date changes between step 1 and step 2, the `UPDATE` matches no row and step 3 returns no row. `queue` is `undefined`, so `queue.queue_number` throws a TypeError. The transaction is rolled back and the client gets HTTP 500 `Server error.`. Window is a few milliseconds per scan. | `server.js:586-598`, `607`, `622-623` |
| Midnight boundary, second variant | If the date changes between step 3 and the `attendance` insert, the stored `scanned_at` (`NOW()`) is on the next day but the queue number belongs to the previous day. | `server.js:596-601` |
| Lock wait | Every accepted scan holds the `daily_queue` row lock until commit. Under heavy load, waiters can hit `innodb_lock_wait_timeout` (default 50 s on MySQL and MariaDB, not verified here). A timeout throws, so the client gets a 500. | `server.js:591-595` |
| Deadlock | No cycle is visible: every path takes the `users` row then the `daily_queue` row. Not observed. | `server.js:550-598` |
| Kiosk double submit | The client's `busy` flag blocks overlapping submits within the same page. It does not protect against two kiosks. The server lock handles that case. | `Scanner.jsx:411`, `459-461` |

Isolation level: the code does not set one, so it uses the default. InnoDB default is REPEATABLE READ. The analysis above assumes that default. Not verified on the live server.

## 8. Writes in the scan path

All of these run inside one transaction. `BEGIN` at `server.js:547` (`beginTransaction`), `COMMIT` at `server.js:611`. Failure paths roll back (`server.js:555`, `575`, `622`). The only writes are the three below, in order. Reads are noted for context.

| Order | Statement (verbatim) | Citation | Transaction |
|---|---|---|---|
| 0 | `BEGIN` (`beginTransaction`) | `server.js:547` | starts |
| R1 | `SELECT * FROM users WHERE employee_id=? FOR UPDATE` | `server.js:550-553` | yes, locking read |
| R2 | `SELECT scanned_at, TIMESTAMPDIFF(SECOND, scanned_at, NOW()) AS ago FROM attendance WHERE user_id=? ORDER BY scanned_at DESC LIMIT 1` | `server.js:569-573` | yes |
| W1 | `INSERT INTO daily_queue (queue_date, last_number) VALUES (CURDATE(), 0) ON DUPLICATE KEY UPDATE last_number=last_number` | `server.js:586-590` | yes |
| W2 | `UPDATE daily_queue SET last_number=LAST_INSERT_ID(last_number + 1) WHERE queue_date=CURDATE()` | `server.js:591-595` | yes |
| R3 | `SELECT last_number AS queue_number FROM daily_queue WHERE queue_date=CURDATE()` | `server.js:596-598` | yes |
| W3 | `INSERT INTO attendance (user_id, employee_id, name, position, queue_number, scanned_at) VALUES (?,?,?,?,?,NOW())` with params `u.id, u.employee_id, \`${u.first_name} ${u.last_name}\`.trim(), u.position, queue.queue_number` | `server.js:600-609` | yes |
| R4 | `SELECT NOW() AS now` | `server.js:610` | yes |
| 1 | `COMMIT` (`commit`) | `server.js:611` | ends |

- No `UPDATE users` anywhere in the scan path.
- `attendance.name` is a snapshot: `${first_name} ${last_name}` at scan time (`server.js:605`). It is not refreshed if the user is later renamed.
- `attendance.position` is a snapshot too (`server.js:608`).
- The connection is released in `finally` (`server.js:624-626`). It is taken from the pool by `db.getConnection()` (`server.js:543`). Pool created at `server.js:851` with default `connectionLimit`, which is 10 (`node_modules/mysql2/lib/pool_config.js:15-17`).

## 9. Messages and client behaviour

### Server messages

| Text (verbatim) | Status | Trigger | Citation |
|---|---|---|---|
| `Attendance recorded.` | 200, `status:"success"` | Scan committed | `server.js:619` |
| `Duplicate scan. Already recorded — try again in N min.` | 429, `status:"duplicate"` | Last scan of any date is less than 10,800 s old | `server.js:582` |
| `QR code not recognized. Ask your admin to register you.` | 404, `status:"failed"` | No user with that trimmed ID | `server.js:559` |
| `Server error.` | 500, `{error:"Server error."}` | Any uncaught error in the scan path or the Express default handler's JSON wrapper. The client treats this as a result with no `status` (see below). | `server.js:103` |

Server messages are not translated and the kiosk shows them as-is in `Result` (`Scanner.jsx:197`, `{r.message}`).

### Client-built messages

| Text (verbatim) | Shown when | Citation |
|---|---|---|
| `Cannot reach the server. Check your connection and try again.` | `fetch` throws, or `response.json()` throws (for example an Express HTML error page from a malformed request). Also used for a dropped network. Shown with title "Scan failed". | `Scanner.jsx:452-457` |
| `Receipt printing could not start automatically. Use Print receipt to try again.` | `printReceipt` resolves `false` or rejects. Red alert under the message. | `Scanner.jsx:198-203`, `436-450`; `printReceipt.js:38`, `139-140`, `145` |
| `Scan successful` (title) | `status === "success"` | `Scanner.jsx:9` |
| `Duplicate scan` (title) | `status === "duplicate"` | `Scanner.jsx:10` |
| `Scan failed` (title) | `status === "failed"` (also the fallback title for any other status) | `Scanner.jsx:11`, `192` |
| `Scan result` (title) | Any `status` not in `TITLES`, including `undefined` from a 500 | `Scanner.jsx:192` |
| `Attendance recorded` / `Already recorded` / `Action required` (badge) | by status; `Action required` is the fallback | `Scanner.jsx:182-186` |
| `Your attendance has been processed successfully.` (footer) | success | `Scanner.jsx:355-356` |
| `Your existing attendance record has been preserved.` (footer) | duplicate | `Scanner.jsx:357-358` |
| `Please check the message above and try again if needed.` (footer) | any other status | `Scanner.jsx:359` |
| `First scanned` / `Scan time` (label) | duplicate / other | `Scanner.jsx:338` |
| `Queue number` (label) | when `queue_number` is set | `Scanner.jsx:208-210` |
| `Print receipt` (button) | when `queue_number` is set | `Scanner.jsx:221` |
| `Queue ticket`, `Print now`, `Close`, `Print receipt` (dialog) | after clicking Print receipt | `Scanner.jsx:233`, `263`, `280`, `230` |
| `Employee` | ticket name fallback when first and last name are both empty | `Scanner.jsx:252-253`; `printReceipt.js:15` |
| `Employee information`, `Full name`, `Employee ID`, `Position` | success and duplicate detail card | `Scanner.jsx:310`, `316`, `323`, `330` |
| `Ready to scan`, `Waiting for QR code`, `Standby` | idle state | `Scanner.jsx:147`, `160`, `829` |
| `Unknown employee`, `No scans recorded yet` | today list | `Scanner.jsx:939`, `903` |
| `Camera unavailable. Allow camera access to use the scanner.` | set in state, **not rendered** (see section 11) | `Scanner.jsx:505-507`; the render is inside the JSX comment at `687-793` |

Not shown to the user: a scan that arrives within 2.5 s of the previous submit is dropped silently (`Scanner.jsx:411`). The `busy` flag is cleared 2,500 ms after each request completes (`Scanner.jsx:459-461`).

### Display timing

- Each result stays on screen for 6,000 ms, then `result` is set to `null` (`Scanner.jsx:402-404`). A newer result cancels the older timer (`Scanner.jsx:400`).
- The busy guard holds for 2,500 ms after each request finishes (`Scanner.jsx:459-461`). Any keystroke-submit during that window is ignored.
- Today's log reloads after a success or duplicate (`Scanner.jsx:397-399`). It does not reload after a failed or 500 response.

### HTTP status handling in the client

The client never checks `response.ok` for `/api/scan`. It calls `response.json()` and calls `show(data)`, using only `data.status` and `data.message` (`Scanner.jsx:417-426`). Consequences:
- A 500 body `{error:"Server error."}` has no `status`, no `message`, no `queue_number`. The card shows title "Scan result", badge "Action required", an empty message paragraph (`Scanner.jsx:197`), and the fallback footer. The user sees no explanation.
- A 404 or 429 is displayed the same way as a 200 in terms of rendering. Only `status` decides the look.

## 10. Ticket printing

What the success response gives the client (`server.js:614-620`):
- `user.first_name`, `user.last_name` (used for the printed name)
- `queue_number` (printed number)
- `scanned_at` and `user.position`, `user.employee_id` (shown on screen, not printed)

Print decision (`Scanner.jsx:428-451`):
- **Printed:** only when `data.status === "success"`. Name is `[first_name, last_name].filter(Boolean).join(" ")`. Number is `data.queue_number`.
- **Skipped:** duplicate (429), failed (404), server error (500), and any response without `status === "success"`.
- Manual "Print receipt" button and dialog: shown only when `queue_number` is set (`Scanner.jsx:205-222`). Only success responses have a number, so it appears only on success cards. The dialog's "Print now" calls `printReceipt` again (`Scanner.jsx:266-281`).

How it prints (`printReceipt.js`):
- Creates a hidden 1 px `iframe` on `document.body` (`printReceipt.js:18-32`).
- Writes HTML with `@page { size: 80mm auto; margin: 0; }`, a 50 pt queue number and a 16 pt name, centred (`printReceipt.js:64-125`).
- Escapes both values with `escapeHtml` (`printReceipt.js:1-11`, `120-121`).
- Calls `printWindow.print()` after a 100 ms `setTimeout` (`printReceipt.js:131-142`).
- Resolves `true` after `print()` returns. Resolves `false` if the iframe or document cannot be created, or if `print()` throws (`printReceipt.js:35-40`, `137-141`).

Kiosk launch: Chrome with `--kiosk --kiosk-printing` (`packaging/Start-Kiosk.ps1:77-82`, `README.md:33-34`). With `--kiosk-printing` the print goes to the default printer without a dialog. Without it, Chrome shows its print dialog.

**Reload after print:** `onAfterPrint` is `() => window.location.reload()` (`Scanner.jsx:434`). `finishPrinting` calls `onAfterPrint` (`printReceipt.js:47-54`, `53`). The success path calls `finishPrinting()` immediately after `print()` returns (`printReceipt.js:135`), without waiting for the `afterprint` event. So the page reloads right after each successful ticket print, which removes the 6-second success card and restarts the page. This is inferred from the code and not run.

## 11. Quirks and bugs

### Behaviour to keep for compatibility

- Route and status codes: `POST /api/scan`, 200 / 429 / 404, and the `status` field in the body. The kiosk depends on `status`, not on the HTTP code.
- Duplicate responses return the time of the earlier scan and no queue number. Repeat taps do not consume a number.
- Cooldown is per employee, measured from the most recent scan of any date, and counts whole seconds. The duration needs to be settled (180 min in working tree, 10 min in README and HEAD).
- No type alternation, no per-day cap. A person can have several accepted scans per day.
- Queue numbers restart at 1 for each `CURDATE()`, and are assigned in the transaction so rejected scans do not consume numbers.
- `attendance.name` and `attendance.position` are snapshots at scan time.
- Deleting a user deletes their attendance (`schema.sql:22`).
- `scanned_at` strings are `YYYY-MM-DD HH:MM:SS` (because `dateStrings: true`, `server.js:851`). The kiosk time formatter expects exactly that format (`Scanner.jsx:102-103`).
- `user` in responses does not include the database `id`.
- Kiosk request body is JSON `{ "code": "..." }`. A request without a JSON content type gives `req.body = {}` and therefore 404.
- `GET /api/attendance/today` is public, with no `auth` (`server.js:630-639`). It returns names, employee IDs and positions. Also see the security note below.

### Looks like a bug (one-line notes)

1. **Camera scanning is disabled.** The `#reader` element is inside a JSX comment (`Scanner.jsx:687-793`, the element at line 727). `new Html5Qrcode("reader")` at `Scanner.jsx:484` therefore throws `"HTML Element with id=reader not found"` (`node_modules/html5-qrcode/esm/html5-qrcode.js:88-89`). The `catch` at `Scanner.jsx:502-509` sets an error that nothing renders. The built `dist` bundle has no `id:"reader"` element either. HEAD has the same comment (`git show HEAD:client/src/pages/Scanner.jsx` lines 786 and 826). The ready screen still says "Position your employee QR code in front of the camera" (`Scanner.jsx:150-152`), and the README says camera scanning works (`README.md:29`). Keyboard or USB-scanner input is the only live path.
2. **Midnight race returns 500.** See section 7. Only a few milliseconds per scan, but it is a real 500.
3. **500 is rendered as an empty result.** `Scanner.jsx:425-426` does not check `response.ok`. The card shows "Scan result" with no message (section 9).
4. **Non-JSON error bodies show "Cannot reach the server".** `Scanner.jsx:452-457` catches `response.json()` failures too, so a server problem looks like a network problem.
5. **Reload after every successful print.** See section 10. The 6-second card is never seen after a successful print.
6. **Attendance list default date is UTC.** `server.js:636` uses `toISOString()`. The kiosk avoids it by sending `date` (`Scanner.jsx:380-383`), but that date comes from the browser clock (`Scanner.jsx:92-97`), not from the server.
7. **Clock going backwards.** A negative `ago` is treated as a duplicate with a wait longer than the cooldown (`server.js:574-577`).
8. **Duplicate label.** The duplicate card says "First scanned" (`Scanner.jsx:338`) but shows the most recent scan's time (`server.js:581`). Same row in practice, so low impact.
9. **Silent drop.** A scan submitted within 2.5 s of the last one is ignored with no feedback (`Scanner.jsx:411`, `459-461`).
10. **Security: no auth or rate limit on `/api/scan`.** Any device on the LAN can probe IDs. The 200 and 429 bodies return `first_name`, `last_name` and `position` for any valid ID (`server.js:563-568`, `614-620`, `578-583`). The 404 versus 429 distinguishes registered from unregistered people.
11. **Public today list.** `GET /api/attendance/today` (`server.js:630-639`) needs no login and returns names, IDs and positions.
12. **Doc drift.** `README.md:30` says 10 minutes. `server.js:16` says 180. Pick one.
13. **HEAD server would not start.** HEAD `server.js:10-15` self-references in its destructuring defaults (temporal dead zone). The working tree fixes this. Only relevant if someone deploys from HEAD.

### Not determined from the code

- Database collation for `users.employee_id` and therefore case and accent matching (section 2).
- MySQL or MariaDB server time zone, which determines what `CURDATE()` and `NOW()` return on the kiosk (section 4).
- Actual isolation level and `innodb_lock_wait_timeout` on the target server (section 7).
- Whether the existing database contains any scans from the working-tree version or from HEAD (`department` column exists in HEAD only).
- Whether Chrome's `afterprint` fires in addition to the direct `finishPrinting()` call (section 10). The reload happens either way.
- Whether `html5-qrcode` keeps firing the callback after a successful decode (moot while the camera path is dead).

## Sources

All citations are file:line in `/home/mdk0/Projects/mbmc-qras/` (working tree), except where marked HEAD (`git show HEAD:...`), `node_modules/...` (`/home/mdk0/Projects/mbmc-qras/node_modules/...`), or `client/dist/...`.
