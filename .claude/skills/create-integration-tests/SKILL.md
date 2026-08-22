---
description: Assists in writing integration tests for the codebase. To be used when the users asks for help writing tests for the backend.
---

# Setup
Tests live inside of backend/src/tests/. It uses a harness (in harness.ts) which sets up the database, using TestContainers.
Integration specific tests live in backend/src/tests/integration.

When writing integration tests - its worth structuring them like the following (if possible)
```typescript
describe("User Admin Settings Integration Test", () => {
    describe("METHOD route (caption)", () => {
        // Insert tests
    })
})
```

Each test file needs something like this to set it up
```typescript
    let harness: TestDatabaseHarness;

    beforeAll(async () => {
        harness = await setupHarness();
    }, 60000);

    afterAll(async () => {
        await harness.close();
    }, 60000);

    beforeEach(async () => {
        await harness.startTransaction();
    });

    afterEach(async () => {
        await harness.rollbackTransaction();
    });
```

Then - within each test, you will need to use the following functions. These come from the harness.
`setupApp()`, returns a copy of the Hono app
`setupClub()` creates a club, and stores it in the database
`setupUser()` creates a user, and stores it in the database

# Requests
When making a request, inject the cookie returned from the setupUser function like below
const { cookie } = await harness.setupUser("test@test.com", role, club.id, "User");
```typescript
const res = await app.request("/api/events", {
    method: "POST",
    headers: { cookie },
    body: JSON.stringify({
        name: "Hello",
        start: new Date(),
        end: new Date(Date.now() + 5000),
    })
});
```

# Focus
Focus on testing core logic, authentication (e.g. testing different roles, ensuring that one club can't access another club etc).
Less focus needs to be on validation (as this is handled by Zod) - however, logic validation (e.g. dates must be in order etc), you can focus on

When testing different roles, it's worth considering using parameterized tests using it.each 