import "server-only";
import { todayAttendanceResponseSchema } from "@/lib/contracts/attendance";
import { classifyDbError, toApiErrorCode } from "../db/errors";
import { getTodayAttendance } from "../services/attendance";
import { apiError, json } from "./responses";

export async function handleTodayAttendanceRequest(): Promise<Response> {
  try {
    const body = todayAttendanceResponseSchema.parse(await getTodayAttendance());
    return json(body, 200);
  } catch (err) {
    console.error("[attendance/today]", err);
    return apiError(toApiErrorCode(classifyDbError(err)));
  }
}
