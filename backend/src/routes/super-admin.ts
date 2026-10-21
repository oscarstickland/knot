import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, count, eq, getTableColumns, isNotNull, or, sql } from "drizzle-orm";
import { hashPassword, isSuperAdmin, type SuperAdminEnv } from "../services/auth";
import type { DbEnv } from "../db/connection";
import {
    clubsTable,
    eventsTable,
    expensesTable,
    incomeTable,
    taskAssignmentsTable,
    taskAuditLogTable,
    taskCommentsTable,
    taskDocumentsTable,
    tasksTable,
    eventDocumentsTable,
    usersTable
} from "../db/schema";
import { describeZodError } from "../types/errors";
import {
    ClubFormSchema,
    CreateAccountSchema,
    UpdateAccountSchema,
    clubDeletableAt,
    type SuperAdminClub
} from "../types/super-admin";
import { offboardMembers } from "../services/members";
import { deleteClubPermanently } from "../services/club-deletion";

type Db = DbEnv["Variables"]["db"];

const superAdminApp = new Hono<SuperAdminEnv & DbEnv>();
superAdminApp.use("*", isSuperAdmin);

const { password: _password, ...accountColumns } = getTableColumns(usersTable);

function toSuperAdminClub(
    club: typeof clubsTable.$inferSelect,
    memberCount: number,
    activeMemberCount: number
): SuperAdminClub {
    return {
        id: club.id,
        name: club.name,
        archivedAt: club.archivedAt,
        deletableAt: club.archivedAt ? clubDeletableAt(club.archivedAt) : null,
        memberCount,
        activeMemberCount
    };
}

async function loadClub(db: Db, clubId: number) {
    const club = await db.query.clubsTable.findFirst({ where: { id: clubId } });
    if (!club) throw new HTTPException(404, { message: "Club not found" });
    return club;
}

// Only club accounts are managed here; super admin accounts are never exposed or editable.
async function loadAccount(db: Db, accountId: number) {
    const account = await db.query.usersTable.findFirst({ where: { id: accountId } });
    if (!account || account.role === "superadmin" || account.clubId === null) {
        throw new HTTPException(404, { message: "Account not found" });
    }
    return { ...account, clubId: account.clubId };
}

async function assertEmailFree(db: Db, email: string, exceptId?: number) {
    const inUse = await db.query.usersTable.findFirst({
        where: { email, ...(exceptId ? { id: { ne: exceptId } } : {}) }
    });
    if (inUse) throw new HTTPException(400, { message: "Email is already in use" });
}

async function parseBody<T>(c: { req: { json: () => Promise<unknown> } }, schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: any } }): Promise<T> {
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });
    return parsed.data as T;
}

// -- Clubs --

superAdminApp.get("/clubs", async (c) => {
    const db = c.get("db");

    const clubs = await db.select().from(clubsTable).orderBy(clubsTable.name);
    const counts = await db
        .select({
            clubId: usersTable.clubId,
            total: count(),
            active: count(sql`case when ${usersTable.status} = 'active' then 1 end`)
        })
        .from(usersTable)
        .where(isNotNull(usersTable.clubId))
        .groupBy(usersTable.clubId);
    const countsByClub = new Map(counts.map((row) => [row.clubId, row]));

    return c.json(clubs.map((club) => {
        const row = countsByClub.get(club.id);
        return toSuperAdminClub(club, row?.total ?? 0, row?.active ?? 0);
    }));
});

superAdminApp.post("/clubs", async (c) => {
    const db = c.get("db");
    const data = await parseBody(c, ClubFormSchema);

    const [club] = await db.insert(clubsTable).values({ name: data.name }).returning();
    return c.json(toSuperAdminClub(club!, 0, 0), 201);
});

superAdminApp.get("/clubs/:id{[0-9]+}", async (c) => {
    const db = c.get("db");
    const club = await loadClub(db, Number(c.req.param("id")));

    const accounts = await db.select({ status: usersTable.status }).from(usersTable).where(eq(usersTable.clubId, club.id));
    return c.json(toSuperAdminClub(club, accounts.length, accounts.filter((a) => a.status === "active").length));
});

superAdminApp.patch("/clubs/:id{[0-9]+}", async (c) => {
    const db = c.get("db");
    const club = await loadClub(db, Number(c.req.param("id")));
    const data = await parseBody(c, ClubFormSchema);

    const [updated] = await db.update(clubsTable).set({ name: data.name }).where(eq(clubsTable.id, club.id)).returning();
    return c.json(toSuperAdminClub(updated!, 0, 0));
});

superAdminApp.post("/clubs/:id{[0-9]+}/archive", async (c) => {
    const db = c.get("db");
    const club = await loadClub(db, Number(c.req.param("id")));
    if (club.archivedAt) throw new HTTPException(400, { message: "Club is already archived" });

    const [updated] = await db.update(clubsTable).set({ archivedAt: new Date() }).where(eq(clubsTable.id, club.id)).returning();
    return c.json(toSuperAdminClub(updated!, 0, 0));
});

superAdminApp.post("/clubs/:id{[0-9]+}/restore", async (c) => {
    const db = c.get("db");
    const club = await loadClub(db, Number(c.req.param("id")));
    if (!club.archivedAt) throw new HTTPException(400, { message: "Club is not archived" });

    const [updated] = await db.update(clubsTable).set({ archivedAt: null }).where(eq(clubsTable.id, club.id)).returning();
    return c.json(toSuperAdminClub(updated!, 0, 0));
});

superAdminApp.delete("/clubs/:id{[0-9]+}", async (c) => {
    const db = c.get("db");
    const club = await loadClub(db, Number(c.req.param("id")));

    if (!club.archivedAt) throw new HTTPException(400, { message: "Archive the club before deleting it" });
    if (clubDeletableAt(club.archivedAt) > new Date()) {
        throw new HTTPException(400, { message: "A club can only be deleted 7 days after it was archived" });
    }

    await deleteClubPermanently(db, club.id);
    return c.body(null, 204);
});

// -- Accounts --

superAdminApp.get("/clubs/:id{[0-9]+}/users", async (c) => {
    const db = c.get("db");
    const club = await loadClub(db, Number(c.req.param("id")));

    const accounts = await db.select(accountColumns).from(usersTable).where(eq(usersTable.clubId, club.id)).orderBy(usersTable.name);
    return c.json(accounts);
});

superAdminApp.post("/clubs/:id{[0-9]+}/users", async (c) => {
    const db = c.get("db");
    const club = await loadClub(db, Number(c.req.param("id")));
    const data = await parseBody(c, CreateAccountSchema);

    await assertEmailFree(db, data.email);

    const [account] = await db
        .insert(usersTable)
        .values({
            name: data.name,
            email: data.email,
            role: data.role,
            password: await hashPassword(data.password),
            clubId: club.id
        })
        .returning(accountColumns);

    return c.json(account, 201);
});

superAdminApp.put("/users/:id{[0-9]+}", async (c) => {
    const db = c.get("db");
    const account = await loadAccount(db, Number(c.req.param("id")));
    const data = await parseBody(c, UpdateAccountSchema);

    await assertEmailFree(db, data.email, account.id);

    const [updated] = await db
        .update(usersTable)
        .set({
            name: data.name,
            email: data.email,
            role: data.role,
            ...(data.password ? { password: await hashPassword(data.password) } : {})
        })
        .where(eq(usersTable.id, account.id))
        .returning(accountColumns);

    return c.json(updated);
});

superAdminApp.post("/users/:id{[0-9]+}/offboard", async (c) => {
    const db = c.get("db");
    const account = await loadAccount(db, Number(c.req.param("id")));
    if (account.status === "offboarded") throw new HTTPException(400, { message: "Account is already offboarded" });

    const unassigned = await offboardMembers(db, [account.id], account.clubId, c.get("superAdmin").id);
    return c.json({
        account: { ...(({ password, ...rest }) => rest)(account), status: "offboarded" as const },
        unassignedTasks: unassigned.get(account.id) ?? []
    });
});

superAdminApp.post("/users/:id{[0-9]+}/reactivate", async (c) => {
    const db = c.get("db");
    const account = await loadAccount(db, Number(c.req.param("id")));
    if (account.status === "active") throw new HTTPException(400, { message: "Account is already active" });

    const [updated] = await db.update(usersTable).set({ status: "active" }).where(eq(usersTable.id, account.id)).returning(accountColumns);
    return c.json(updated);
});

// The schema has no foreign keys, so deleting an account that authored records would leave dangling ids.
// Accounts with any history must be offboarded instead.
async function hasAuthoredRecords(db: Db, userId: number): Promise<boolean> {
    const checks = await Promise.all([
        db.select({ n: count() }).from(tasksTable).where(eq(tasksTable.createdBy, userId)),
        db.select({ n: count() }).from(taskDocumentsTable).where(eq(taskDocumentsTable.addedBy, userId)),
        db.select({ n: count() }).from(taskAuditLogTable).where(eq(taskAuditLogTable.changedBy, userId)),
        db.select({ n: count() }).from(taskCommentsTable).where(eq(taskCommentsTable.authorId, userId)),
        db.select({ n: count() }).from(expensesTable).where(or(eq(expensesTable.createdBy, userId), eq(expensesTable.reimbursedBy, userId))),
        db.select({ n: count() }).from(incomeTable).where(eq(incomeTable.createdBy, userId)),
        db.select({ n: count() }).from(eventDocumentsTable).where(eq(eventDocumentsTable.addedBy, userId))
    ]);
    return checks.some(([row]) => (row?.n ?? 0) > 0);
}

superAdminApp.delete("/users/:id{[0-9]+}", async (c) => {
    const db = c.get("db");
    const account = await loadAccount(db, Number(c.req.param("id")));

    if (await hasAuthoredRecords(db, account.id)) {
        throw new HTTPException(409, { message: "This account has created records, so it can't be removed. Offboard it instead." });
    }

    await db.transaction(async (tx) => {
        await tx.delete(taskAssignmentsTable).where(eq(taskAssignmentsTable.userId, account.id));
        await tx.delete(usersTable).where(and(eq(usersTable.id, account.id), isNotNull(usersTable.clubId)));
    });
    return c.body(null, 204);
});

export { superAdminApp };
