# Optional context-store integration

The demo now loads the supplied CSV directly, without Neo4j. This document keeps
the optional conversation-context contract for a later database adapter. No graph
queries or persisted conversation context are implemented. CSV configuration is in
[csv-integration.md](csv-integration.md).

## One composition point

If a database adapter is added later, keep the composition point in
`src/lib/integrations/data-sources.ts`:

- `getAttendeeRepository()`: an `AttendeeRepository` from `integrations/contracts.ts`.
- `contextStore`: a `NetworkingContextStore` from `integrations/context-contracts.ts`.

The conference page, chat, legacy recommendations, and meeting-recipient validation
all use `getAttendeeRepository()`. Keep IDs stable when mapping CSV rows to the
agreed `Attendee` contract. `event-config.ts` selects the event using
`ATTENDEES_EVENT_ID` for CSV data or the fixture event in explicit mock mode.

The repository contract is:

```ts
getById(id: string): Promise<Attendee | null>;
listByEvent(eventId: string): Promise<Attendee[]>;
```

`listByEvent` must apply event isolation in its query. The chat service also
filters event IDs, removes the requester, and deduplicates IDs before inference.
Public profiles strip email and phone before serialization to browser or Qwen.

## Context contract

```ts
interface NetworkingContextScope {
  eventId: string;
  attendeeId: string;
  sessionId: string;
}

interface NetworkingContextStore {
  load(scope: NetworkingContextScope): Promise<ChatMessage[]>;
  appendExchange(
    exchange: NetworkingContextScope & {
      userMessage: string;
      assistantMessage: string;
    },
  ): Promise<void>;
}
```

Constrain every read and write by **all three scope fields**. Return the latest
ten messages in chronological order, with `role` user/assistant and non-empty
content up to 1000 characters. Append the two messages together atomically.
The service bounds the assistant snippet before saving it.

Once configured, the store's history is authoritative; client history is ignored.
Missing `sessionId` returns 400. Adapter failures return 502 rather than silently
pretending memory was loaded/saved. The service appends only after validating the
recommendation response. Rejected provider output must not enter graph memory.

With `contextStore = null`, the current demo uses bounded client conversation
history. `ChatResponse.memory` is `client`; with the adapter it is `context-store`.
The placeholder creates a browser UUID per conversation and regenerates it on a
persona switch. Session IDs provide scoping, not authentication.

## Other lanes

- The final UI can consume the APIs in `frontend-integration.md` without importing
  provider or Neo4j code into client components.
- The skill owner can replace `skills/networking/SKILL.md`. Qwen mode reads its
  guidance at request time; this branch leaves the placeholder untouched.
- Qwen inference runs inside Daytona when configured. Graph/context retrieval and
  canonical response validation currently run in the Next.js server.
- Meeting requests currently persist in an ignored single-process JSON demo store.
  They are separate from conversation context; no real notification is sent.

## Validation and exclusions

Run `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`, and
`npm run test:smoke` after integrating. Keep automated tests offline by injecting
test repositories/context stores; the opt-in `check:providers` makes a real call.
Existing context tests demonstrate scope, authoritative history, atomic exchange
callbacks, and failure propagation using an injected adapter.

Do not add registration, profile editing, auth, real messaging, or a new graph
schema as part of the merge. Preserve configured-provider failure behavior and
the final UI lane's ownership.
