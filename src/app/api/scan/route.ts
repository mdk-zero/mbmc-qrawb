import { connection } from "next/server";
import { handleScanRequest } from "@/server/http/scan-handler";

export async function POST(request: Request) {
  await connection();
  return handleScanRequest(request);
}
