import fs from "node:fs";
import path from "node:path";
import { createConnection } from "mysql2/promise";
import { runMigrations } from "../../src/server/db/migrate";

export default async function setup() {
  const name = process.env.TEST_DB_NAME || "qr_attendance_test";
  if (!/_test(_[a-z0-9_]+)?$/.test(name)) {
    throw new Error(`Refusing to use database "${name}": name must end in _test`);
  }
  const target = {
    host: process.env.TEST_DB_HOST || "127.0.0.1",
    port: Number(process.env.TEST_DB_PORT || 3307),
    user: process.env.TEST_DB_USER || "root",
    password: process.env.TEST_DB_PASS ?? "",
  };
  const admin = await createConnection({ ...target, multipleStatements: true });
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await admin.query(`CREATE DATABASE \`${name}\``);
    await admin.query(`USE \`${name}\``);
    await admin.query(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/legacy-schema.sql"), "utf8"));
  } finally {
    await admin.end();
  }
  const problems = await runMigrations({ ...target, database: name });
  if (problems.length) throw new Error(`Test schema problems: ${problems.join("; ")}`);
}
