# Knot
Creates a centralized platform for univeristy clubs to manage their club events. Monash University Capstone project for FIT3161/FIT3162.

## Development

### Prerequisites
- [Bun](https://bun.com/) - used as the NodeJS runtime
- Postgres database, and probably a viewer (e.g. [pgAdmin](https://www.pgadmin.org/))
- [mprocs](https://github.com/pvolok/dekit/releases/tag/v0.9.6) - Optional, used to run both backend and frontend at the same time

### Technologies
- [Hono](https://hono.dev/) - Used as the HTTP Server
- [Drizzle ORM](https://orm.drizzle.team/) - Used as the Database ORM
- [Zod](https://zod.dev/) - Used to encode schemas.

> [!NOTE]
> Some Zod schemas are shared between the frontend and the backend. This ensures that the frontend is sending content in the format that the backend will expect. 

### Preparation
**Environment Files:**
Within the backend, copy `backend/.SAMPLE.env` and paste it into `backend/.env`. Populate all the values (e.g. the Postgres connection URL and JWT token etc).

**Database Configuration:** You'll also want to populate the database. To setup the schema and insert some dummy data, use `bun run dev:generate` from the root directory. 
View `backend/db/generate.ts` for more information.

> [!WARNING]
> This generate command will overwrite anything currently present in the database.

### Running the Application
In seperate terminals, run
```
bun run dev:backend
bun run dev:frontend
```
Or, if you have mprocs, simply run `mprocs`

