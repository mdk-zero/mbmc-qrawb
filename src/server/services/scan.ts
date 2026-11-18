import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  EMPLOYEE_ID_MAX_LENGTH,
  SCAN_FAILED_MESSAGE,
  SCAN_SUCCESS_MESSAGE,
  formatDuplicateMessage,
  type ScanFailed,
  type ScanOutcome,
} from "@/lib/contracts/scan";
import { getPool } from "../db/client";
import { classifyDbError } from "../db/errors";
import { getEnv } from "../env";
import {
  addSecondsLocal,
  localDateOf,
  toLocalDateTime,
  wallClockSeconds,
} from "../time";
import { getCooldownMinutes } from "./settings";

const RETRY_WINDOW_MS = 2000;
const MAX_ATTEMPTS = 2;

const failed = (): ScanFailed => ({ status: "failed", message: SCAN_FAILED_MESSAGE });

type UserRow = RowDataPacket & {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  position: string;
};

async function attemptScan(
  conn: PoolConnection,
  userId: number,
  cooldownMinutes: number,
  lockWaitTimeoutSeconds: number,
  nowFn: () => Date,
): Promise<ScanOutcome> {
  await conn.query("SET SESSION innodb_lock_wait_timeout = ?", [lockWaitTimeoutSeconds]);
  await conn.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await conn.query("START TRANSACTION");
  try {
    const [users] = await conn.query<UserRow[]>(
      "SELECT id, employee_id, first_name, last_name, position FROM users WHERE id = ? FOR UPDATE",
      [userId],
    );
    const user = users[0];
    if (!user) {
      await conn.query("ROLLBACK");
      return failed();
    }

    const now = toLocalDateTime(nowFn(), getEnv().APP_TIMEZONE);
    const today = localDateOf(now);
    const fullName = `${user.first_name} ${user.last_name}`.trim();
    const employee = {
      employee_id: user.employee_id,
      first_name: user.first_name,
      last_name: user.last_name,
      full_name: fullName,
      position: user.position,
    };

    // The queue row is locked before the first consistent read so the snapshot
    // is taken after every lock is held. MariaDB 11.6+ (snapshot isolation)
    // fails the queue update with error 1020 if the snapshot comes first.
    await conn.query(
      "INSERT INTO daily_queue (queue_date, last_number) VALUES (?, 1) ON DUPLICATE KEY UPDATE last_number = last_number + 1",
      [today],
    );
    const [queue] = await conn.query<(RowDataPacket & { last_number: number })[]>(
      "SELECT last_number FROM daily_queue WHERE queue_date = ? FOR UPDATE",
      [today],
    );
    if (!queue[0]) throw new Error("daily_queue row missing after increment");
    const queueNumber = Number(queue[0].last_number);

    const [last] = await conn.query<(RowDataPacket & { scanned_at: string })[]>(
      "SELECT scanned_at FROM attendance WHERE user_id = ? ORDER BY scanned_at DESC LIMIT 1",
      [user.id],
    );
    if (last[0]) {
      const lastScannedAt = last[0].scanned_at;
      const endsAt = addSecondsLocal(lastScannedAt, cooldownMinutes * 60);
      const remaining = wallClockSeconds(endsAt) - wallClockSeconds(now);
      if (remaining > 0) {
        await conn.query("ROLLBACK");
        const retryAfter = Math.max(1, Math.ceil(remaining / 60));
        return {
          status: "duplicate",
          message: formatDuplicateMessage(retryAfter),
          employee,
          last_scanned_at: lastScannedAt,
          cooldown_ends_at: endsAt,
          retry_after_minutes: retryAfter,
        };
      }
    }

    await conn.query<ResultSetHeader>(
      "INSERT INTO attendance (user_id, employee_id, name, position, queue_number, scanned_at) VALUES (?, ?, ?, ?, ?, ?)",
      [user.id, user.employee_id, fullName, user.position, queueNumber, now],
    );
    await conn.query("COMMIT");

    return {
      status: "success",
      message: SCAN_SUCCESS_MESSAGE,
      employee,
      queue_number: queueNumber,
      queue_date: today,
      scanned_at: now,
    };
  } catch (err) {
    try {
      await conn.query("ROLLBACK");
    } catch {
      // connection may already be gone
    }
    throw err;
  }
}

export async function scanEmployee(
  rawCode: string,
  options: { now?: () => Date; lockWaitTimeoutSeconds?: number } = {},
): Promise<ScanOutcome> {
  const code = rawCode.trim();
  if (code === "" || code.length > EMPLOYEE_ID_MAX_LENGTH) return failed();

  const cooldownMinutes = await getCooldownMinutes();
  const pool = getPool();

  const [found] = await pool.query<(RowDataPacket & { id: number })[]>(
    "SELECT id FROM users WHERE employee_id = ? LIMIT 1",
    [code],
  );
  if (!found[0]) return failed();

  const startedAt = Date.now();
  const conn = await pool.getConnection();
  let broken = false;
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        return await attemptScan(
          conn,
          found[0].id,
          cooldownMinutes,
          options.lockWaitTimeoutSeconds ?? 2,
          options.now ?? (() => new Date()),
        );
      } catch (err) {
        const kind = classifyDbError(err);
        if (kind === "db_unavailable") broken = true;
        if (
          kind === "deadlock" &&
          attempt < MAX_ATTEMPTS &&
          Date.now() - startedAt < RETRY_WINDOW_MS
        ) {
          continue;
        }
        throw err;
      }
    }
  } finally {
    if (broken) conn.destroy();
    else conn.release();
  }
}
