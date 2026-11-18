import { loadEnvConfig } from "@next/env";
import { runMigrations } from "../src/server/db/migrate";

loadEnvConfig(process.cwd());

async function main() {
  const { getEnv } = await import("../src/server/env");
  const env = getEnv();
  const problems = await runMigrations({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASS,
    database: env.DB_NAME,
  });
  if (problems.length > 0) {
    console.error(`The database ${env.DB_NAME} does not match the expected legacy schema:`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error("Start the old mbmc-qras app once to finish its schema upgrade, then retry.");
    process.exit(1);
  }
  console.log(`Migrations applied to ${env.DB_NAME}.`);
}

main().catch((err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
