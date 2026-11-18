import { connection } from "next/server";
import { handleTodayAttendanceRequest } from "@/server/http/attendance-today-handler";

export async function GET() {
  await connection();
  return handleTodayAttendanceRequest();
}
