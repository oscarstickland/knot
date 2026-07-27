import { defineRelations } from "drizzle-orm";
import { integer, pgTable, varchar } from "drizzle-orm/pg-core";

export const clubsTable = pgTable("clubs", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 255 }).notNull()
});

export const usersTable = pgTable("users", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 255 }).notNull(),
    email: varchar({ length: 255 }).notNull().unique(),
    password: varchar({ length: 500 }).notNull(),
    clubId: integer("club_id").notNull(),
})

export const relations = defineRelations({ clubsTable, usersTable }, (r) => ({
    usersTable: {
        club: r.one.clubsTable({
            from: r.usersTable.clubId,
            to: r.clubsTable.id
        })
    }
}));