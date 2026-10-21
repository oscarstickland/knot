// Creates a super admin, or promotes an existing account to one.
//
//   SUPER_ADMIN_PASSWORD=... bun src/scripts/create-super-admin.ts <email> [name]
//
// - New email: creates the account (name required, password required).
// - Existing email: promotes it. The account is detached from its club, and the password
//   is only changed when SUPER_ADMIN_PASSWORD is set.
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { relations, usersTable } from "../db/schema";
import { hashPassword } from "../services/auth";

const MIN_PASSWORD_LENGTH = 8;

async function main() {
    const [email, name] = process.argv.slice(2);
    const password = process.env.SUPER_ADMIN_PASSWORD;

    if (!email) throw new Error("Usage: SUPER_ADMIN_PASSWORD=... bun src/scripts/create-super-admin.ts <email> [name]");
    if (password !== undefined && password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`SUPER_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzle({ client: pool, relations });

    try {
        const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

        if (existing) {
            await db.update(usersTable).set({
                role: "superadmin",
                clubId: null,
                status: "active",
                ...(password ? { password: await hashPassword(password) } : {})
            }).where(eq(usersTable.id, existing.id));
            console.log(`Promoted ${email} to super admin`);
            return;
        }

        if (!name) throw new Error("A name is required when creating a new super admin");
        if (!password) throw new Error("SUPER_ADMIN_PASSWORD is required when creating a new super admin");

        await db.insert(usersTable).values({
            name, email, role: "superadmin", clubId: null, password: await hashPassword(password)
        });
        console.log(`Created super admin ${email}`);
    } finally {
        await pool.end();
    }
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
