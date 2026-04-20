# Backend Authority Plan

This document captures Phase 2 of the LifeOS backend hardening work.

## Problem Summary

Before the refactor work:

- the frontend owned most of the business rules
- the backend mostly stored whatever JSON the client sent
- tasks, notes, calendar, and planner were commonly saved as whole documents
- there was no consistent validation or revision model across resources

That made the backend closer to passive storage than a source of truth.

## Goal

Keep the current stack and current endpoints, but make the backend more authoritative, safer, and easier to evolve.

## Design Principles

1. The backend decides what valid data looks like.
2. Every resource should follow the same persistence pattern.
3. User scoping must happen on the server, not be trusted from the client.
4. Full-document writes should be guarded, even if they are not fully replaced yet.
5. The current frontend should keep working while the backend becomes stricter.

## Current Resource Model

These resources currently exist:

- `tasks`
- `notes`
- `calendar`
- `planner`

Each resource is stored per authenticated Netlify user in Netlify Blobs.

## Recommended Backend Resource Shape

Store each resource in an envelope rather than storing raw client JSON directly:

```ts
type ResourceEnvelope<T> = {
  version: 1;
  updatedAt: string;
  revision: number;
  resource: T;
};
```

Why this helps:

- `version` gives us room for migrations later
- `updatedAt` is controlled by the server
- `revision` lets the server detect stale writes
- `resource` keeps the actual domain payload separate from metadata

## Request and Response Shape

### GET

For compatibility, the backend should keep returning the raw resource body that the current frontend expects.

In addition, the backend should expose metadata in headers:

- `X-LifeOS-Version`
- `X-LifeOS-Revision`
- `X-LifeOS-Updated-At`

This means the existing frontend does not break, but future frontend code can become safer by using those headers.

### POST

The backend should accept two forms:

1. Legacy raw payloads
2. A future envelope-style payload

Examples:

Legacy:

```json
[
  {
    "id": "task_1",
    "title": "Example"
  }
]
```

Future-friendly:

```json
{
  "resource": [
    {
      "id": "task_1",
      "title": "Example"
    }
  ],
  "meta": {
    "revision": 3
  }
}
```

## Validation Rules

Validation should happen in the backend function before persistence.

### Tasks

The backend should enforce:

- payload must be an array
- every task must have a safe ID
- `status` must be `todo`, `doing`, or `done`
- `priority` must be `1`, `2`, or `3`
- date and datetime fields must be normalized
- arrays like `tags` must be sanitized

### Notes

The backend should enforce:

- payload must be an object
- `notes` must be an array
- every note must have `id`, `title`, and `content`
- `activeId` must refer to an existing note or be reset safely

### Calendar

The backend should enforce:

- payload must be a date-keyed object
- date keys must be valid `yyyy-mm-dd`
- events must have sane IDs and titles
- hours, minutes, duration, provider, and task status must be normalized

### Planner

The backend should enforce:

- payload must be an object
- planner defaults and migrations should happen on the server
- pay cycle, cadence, goal type, and FHSS fields must be normalized
- all numeric values should be clamped to safe ranges

## Safer Update Pattern

The first step is not a full rewrite to partial updates.

Instead:

1. read the current stored envelope
2. validate and normalize the incoming resource
3. compare the client revision if one was sent
4. reject stale writes with `409 Conflict`
5. store the next envelope with incremented revision

This makes whole-document writes safer without requiring a frontend rewrite.

## Optimistic Concurrency

The backend should support optimistic concurrency now.

Accepted revision sources:

- `X-LifeOS-Revision` request header
- `meta.revision` in a request body
- `revision` in a request body

If the client sends a revision and it does not match the current stored revision, the backend should reject the write.

That prevents silent overwrites from stale clients.

## Consistency Across Resources

All four resource handlers should follow the same structure:

1. authenticate user
2. derive user-scoped storage key
3. parse JSON safely
4. validate and normalize resource
5. check revision when provided
6. write a server envelope
7. respond with structured JSON and metadata headers

## Compatibility Strategy

To avoid unnecessary frontend breakage:

- keep existing route paths
- keep `GET` and `POST`
- keep accepting current raw payloads
- return raw resource bodies for `GET`
- add metadata in headers and success responses for future use

## What Should Come Next

After this design is in place, the next backend improvements should be:

1. item-level mutation endpoints for tasks and calendar
2. note-level mutations instead of whole-notes payload writes
3. planner-specific patch operations where useful
4. server-owned task/calendar linking rules instead of browser-event-only sync
5. frontend updates to send and respect revision metadata on every write

## Practical Outcome

This design keeps the current application working, but changes the backend role from:

"store whatever the client sends"

to:

"validate, normalize, scope, version, and then persist only accepted data"
