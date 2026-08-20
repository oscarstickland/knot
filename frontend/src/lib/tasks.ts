/**
 * SWR key for an event's task list. Kept in one place so the key used to fetch a list and
 * the key used to revalidate it after a mutation can never drift apart.
 */
export const taskListKey = (eventId: number, archived = false) =>
    `/tasks?eventId=${eventId}&archived=${archived}`;
