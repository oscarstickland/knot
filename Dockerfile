# -- Step 1 - build the frontend in a seperate container
FROM oven/bun:1.3-alpine AS frontend-builder

WORKDIR /src

COPY package.json ./
COPY bun.lock ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json

RUN cd frontend && bun install --frozen-lockfile

# Now - copy both the frontend and the backend
# note - copying the backend is required, as the frontend depends on the backend
COPY frontend ./frontend/
COPY backend ./backend/

RUN cd frontend && bun run build

# -- Step 2 -- build the backend
# (and combine the frontend)
FROM oven/bun:1.3-alpine AS backend-builder

WORKDIR /src

COPY package.json ./
COPY bun.lock ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json

RUN cd backend && bun install --production --frozen-lockfile

# fixed numeric UID/GID so k8s runAsNonRoot can verify the user
RUN addgroup -S -g 10001 knot && adduser -S -u 10001 -G knot knot

COPY --chown=knot:knot backend ./backend/
COPY --chown=knot:knot --from=frontend-builder /src/frontend/dist backend/dist

USER 10001:10001

WORKDIR /src/backend

EXPOSE 3000

CMD ["bun", "src/index.ts"]