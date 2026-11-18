import "server-only";
import { z } from "zod";

const orDefault = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : v));

const envSchema = z.object({
  DB_HOST: orDefault("localhost"),
  DB_PORT: orDefault("3306").pipe(
    z.string().transform(Number).pipe(z.number().int().min(1).max(65535)),
  ),
  DB_USER: orDefault("root"),
  DB_PASS: z.string().optional().default(""),
  DB_NAME: orDefault("qr_attendance"),
  APP_TIMEZONE: orDefault("Asia/Manila"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const env = envSchema.parse(process.env);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: env.APP_TIMEZONE });
  } catch {
    throw new Error(`Invalid APP_TIMEZONE "${env.APP_TIMEZONE}"`);
  }
  cached = env;
  return env;
}

export function resetEnvForTests(): void {
  cached = undefined;
}
