import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () => text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);
const updatedAt = () => text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  createdAt: createdAt(),
});

export const userMigrations = sqliteTable("user_migrations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  migrationKey: text("migration_key").notNull(),
  completedAt: text("completed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("user_migrations_user_key_unique").on(table.userId, table.migrationKey),
]);

export const routineTemplates = sqliteTable("routine_templates", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Ideal Day"),
  startMinutes: integer("start_minutes").notNull().default(480),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("routine_templates_user_idx").on(table.userId)]);

export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clientKey: text("client_key").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  icon: text("icon").notNull(),
  color: text("color").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("activities_user_client_key_unique").on(table.userId, table.clientKey)]);

export const routineItems = sqliteTable("routine_items", {
  id: text("id").primaryKey(),
  routineId: text("routine_id").notNull().references(() => routineTemplates.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  duration: integer("duration").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("routine_items_routine_activity_unique").on(table.routineId, table.activityId),
  index("routine_items_routine_position_idx").on(table.routineId, table.position),
]);

export const dailyPlans = sqliteTable("daily_plans", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planDate: text("plan_date").notNull(),
  templateId: text("template_id").references(() => routineTemplates.id, { onDelete: "set null" }),
  startMinutes: integer("start_minutes").notNull().default(480),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("daily_plans_user_date_unique").on(table.userId, table.planDate)]);

export const dailyPlanItems = sqliteTable("daily_plan_items", {
  id: text("id").primaryKey(),
  dailyPlanId: text("daily_plan_id").notNull().references(() => dailyPlans.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  clientKey: text("client_key").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  icon: text("icon").notNull(),
  color: text("color").notNull(),
  position: integer("position").notNull(),
  duration: integer("duration").notNull(),
  completedAt: text("completed_at"),
  removedAt: text("removed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("daily_plan_items_plan_client_key_unique").on(table.dailyPlanId, table.clientKey),
  index("daily_plan_items_plan_position_idx").on(table.dailyPlanId, table.position),
]);

export const settings = sqliteTable("settings", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  pullForwardAfterEarlyCompletion: integer("pull_forward_after_early_completion", { mode: "boolean" }).notNull().default(false),
  updatedAt: updatedAt(),
});
