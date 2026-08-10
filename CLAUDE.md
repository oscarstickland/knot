# Project Structure
Uses Bun with a Hono backend and a React frontend (using React Router). 
Structured into two different bun/npm packages, in `backend/` and `frontend/`.

There isn't a massive link between the two, except that some types and Zod schemas are 
exported from `backend/types/` and are read in the frontend.

# Backend
## Database (Drizzle)
Uses Drizzle ORM (Postgres). All files stored in `backend/src/db/`. Schema is in `backend/src/db/schema.ts`.
Additionally - there is a populate/generate function, which stores dummy data in `backend/src/db/populate.ts`. If a new schema or table is added - there is a reasonable chance that some dummy data should also be added.

Generally - the goal here is to use good DB practices when creating new tables and relations. User will also need to run the drizzle generate and migrate commands from within the `backend/` directory.

## Server (Hono)
Uses Hono as the server. It's a relatively standard setup, there are different routers within the `backend/src/routes/` directory - which are grouped relatively logically.

We also use some middleware. The first one is an auth middleware called `isAuthenticated` in `backend/src/services/auth.ts`. The second one is called `attachDatabase` in `backend/src/db/connection.ts`. It's worth noting here - whenever using the db connection, use this middleware (don't use it directly).

## Data Validation (Zod)
I've used Zod for all the data validation - this is stored in `backend/src/types/*`. 
Note - where possible, share these types with the frontend - you will need to export them in `backend/package.json`.

Also - you generally can't use the zValidator hono function - as because of the env types that are used, this will break. So instead, just do it in the body of the function.

# Frontend
Application uses React Router, and so it operates as an SPA.

## UI (Ant Design)
Use ant design for major components - like buttons, modals etc.

## Forms (React hook forms)
Use the React Hook Forms to manage validating and errors in forms. Look inside `frontend/src/components/EventModal.tsx` as a good example of how this could work.
Generally try to show error states etc. You can use the Notification API from Ant D as an option as well.

## Data Fetching (SWR)
SWR is used for data fetching - again, you might be able to use the types exported from the backend so you know the direct type. Always have an error state.
Axios is used for data pushing (e.g. POST, PUT etc). The axios instance is in `frontend/src/lib/fetcher.tsx`


