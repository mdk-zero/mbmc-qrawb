import "server-only";
import {
  API_ERROR_HTTP_STATUS,
  API_ERROR_MESSAGES,
  type ApiError,
  type ApiErrorCode,
} from "@/lib/contracts/common";

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export function apiError(code: ApiErrorCode): Response {
  const body: ApiError = {
    status: "error",
    code,
    message: API_ERROR_MESSAGES[code],
  };
  return json(body, API_ERROR_HTTP_STATUS[code]);
}
