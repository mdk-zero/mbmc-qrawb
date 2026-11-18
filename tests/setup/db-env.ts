const testDbName = process.env.TEST_DB_NAME || "qr_attendance_test";
if (!/_test(_[a-z0-9_]+)?$/.test(testDbName)) {
  throw new Error(`Refusing to run tests against database "${testDbName}": name must end in _test`);
}
process.env.DB_HOST = process.env.TEST_DB_HOST || "127.0.0.1";
process.env.DB_PORT = process.env.TEST_DB_PORT || "3307";
process.env.DB_USER = process.env.TEST_DB_USER || "root";
process.env.DB_PASS = process.env.TEST_DB_PASS ?? "";
process.env.DB_NAME = testDbName;
process.env.APP_TIMEZONE = "Asia/Manila";

export {};
