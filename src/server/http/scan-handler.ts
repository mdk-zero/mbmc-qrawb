import "server-only";
import {
  SCAN_OUTCOME_HTTP_STATUS,
  scanRequestSchema,
  scanResponseSchema,
} from "@/lib/contracts/scan";
import { classifyDbError, toApiErrorCode } from "../db/errors";
import { scanEmployee } from "../services/scan";
import { apiError, json } from "./responses";

const MAX_BODY_BYTES = 4096;

export async function handleScanRequest(request: Request): Promise<Response> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return apiError("invalid_request");
  }
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return apiError("invalid_request");

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return apiError("invalid_request");
  }
  const parsed = scanRequestSchema.safeParse(payload);
  if (!parsed.success) return apiError("invalid_request");

  try {
    const outcome = await scanEmployee(parsed.data.code);
    const body = scanResponseSchema.parse(outcome);
    return json(body, SCAN_OUTCOME_HTTP_STATUS[outcome.status]);
  } catch (err) {
    console.error("[scan]", err);
    return apiError(toApiErrorCode(classifyDbError(err)));
  }
}
