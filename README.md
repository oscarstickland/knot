# Knot
Creates a centralized platform for univeristy clubs to manage their club events. Monash University Capstone project for FIT3161/FIT3162.

## Development

### Prerequisites
- [Bun](https://bun.com/) - used as the NodeJS runtime
- Postgres database, and probably a viewer (e.g. [pgAdmin](https://www.pgadmin.org/))
- [mprocs](https://github.com/pvolok/dekit/releases/tag/v0.9.6) - Optional, used to run both backend and frontend at the same time

### Preparing
Within the backend, copy `backend/.SAMPLE.env` and paste it into `backend/.env`

Populate all the values (e.g. the Postgres connection URL and JWT token etc)

### Running the Application
In seperate terminals, run
```
bun run dev:backend
bun run dev:frontend
```
Or, if you have mprocs, simply run `mprocs`

