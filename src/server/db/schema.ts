import "server-only";
import {
  mysqlTable,
  int,
  varchar,
  datetime,
  date,
  timestamp,
  text,
  index,
  foreignKey,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: varchar("employee_id", { length: 50 }).notNull().unique("employee_id"),
  firstName: varchar("first_name", { length: 120 }).notNull(),
  lastName: varchar("last_name", { length: 120 }).notNull(),
  position: varchar("position", { length: 100 }).notNull(),
  photoFilename: varchar("photo_filename", { length: 100 }),
  email: varchar("email", { length: 120 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow(),
});

export const attendance = mysqlTable(
  "attendance",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    employeeId: varchar("employee_id", { length: 50 }),
    name: varchar("name", { length: 241 }),
    position: varchar("position", { length: 100 }).notNull(),
    queueNumber: int("queue_number").notNull(),
    scannedAt: datetime("scanned_at", { mode: "string" }).notNull(),
  },
  (t) => [
    index("user_id").on(t.userId, t.scannedAt),
    foreignKey({
      name: "attendance_ibfk_1",
      columns: [t.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
  ],
);

export const dailyQueue = mysqlTable("daily_queue", {
  queueDate: date("queue_date", { mode: "string" }).primaryKey(),
  lastNumber: int("last_number").notNull(),
});

export const settings = mysqlTable("settings", {
  settingKey: varchar("setting_key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: datetime("updated_at", { mode: "string" }).notNull(),
});
