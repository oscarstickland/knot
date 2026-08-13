import { defineRelations } from "drizzle-orm";
import {boolean, integer, pgEnum, pgTable, timestamp, varchar} from "drizzle-orm/pg-core";

export const userRoles = ["standard", "exec", "admin"] as const;
export type UserRole = (typeof userRoles)[number];
export const rolesEnum = pgEnum("roles", userRoles);

export const clubsTable = pgTable("clubs", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 255 }).notNull()
});

export const usersTable = pgTable("users", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 255 }).notNull(),
    email: varchar({ length: 255 }).notNull().unique(),
    password: varchar({ length: 500 }).notNull(),
    role: rolesEnum().default("standard").notNull(),
    clubId: integer("club_id").notNull(),
});

export const eventsTable = pgTable("events", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 255 }).notNull(),
    start: timestamp("start_time", { mode: "date", withTimezone: true }).notNull(),
    end: timestamp("end_time", { mode: "date", withTimezone: true }).notNull(),
    clubId: integer("club_id").notNull(),
    archived: boolean("archived").default(false).notNull(),
});

export const relations = defineRelations({ clubsTable, usersTable, eventsTable }, (r) => ({
    usersTable: {
        club: r.one.clubsTable({
            from: r.usersTable.clubId,
            to: r.clubsTable.id
        })
    },
    eventsTable: {
        club: r.one.clubsTable({
            from: r.eventsTable.clubId,
            to: r.clubsTable.id
        })
    },
    clubsTable: {
        users: r.many.usersTable(),
        events: r.many.eventsTable()
    }
}));