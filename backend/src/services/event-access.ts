import type { DbEnv } from "../db/connection.ts";
import type { UserEnv } from "./auth.ts";

type Db = DbEnv["Variables"]["db"];
type SessionUser = UserEnv["Variables"]["user"];

// Where-clause for the events a user may see. Execs and admins see every event in their club;
// standard members only see team-wide events and events they have been assigned to.
export function eventAccess(user: SessionUser) {
    if (user.role !== "standard") return { clubId: user.club.id };

    return {
        clubId: user.club.id,
        OR: [{ teamWide: true }, { members: { userId: user.id } }]
    };
}

// For routes that reach an event through one of its children (a task, expense, document...).
export async function canAccessEvent(db: Db, eventId: number, user: SessionUser): Promise<boolean> {
    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, ...eventAccess(user) },
        columns: { id: true }
    });
    return event !== undefined;
}

// Execs and admins can edit any event; standard members can edit events they are assigned to.
export async function canEditEvent(db: Db, eventId: number, user: SessionUser): Promise<boolean> {
    if (user.role !== "standard") return true;

    const assignment = await db.query.eventMembersTable.findFirst({
        where: { eventId, userId: user.id },
        columns: { eventId: true }
    });
    return assignment !== undefined;
}
