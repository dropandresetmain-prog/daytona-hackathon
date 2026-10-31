# Final UI integration

Replace the placeholder `src/components/networking-app.tsx`; the backend does not
depend on its layout. `src/app/page.tsx` currently passes:

```ts
{ event: { name: string; description: string }, attendees: AttendeeProfile[] }
```

Import shared types from `@/lib/types` and `@/lib/meeting-types`. The page uses
`publicProfile` before passing fixtures to the browser. Preserve that boundary
when switching to the teammate's repository; email/phone are not client props.
All current profiles are fictional. Default demo identity: `alex`.

## Conversation

`POST /api/chat`, `Content-Type: application/json`:

```json
{
  "attendeeId": "alex",
  "message": "Who should I connect with at this conference?",
  "history": [],
  "sessionId": "a-browser-generated-conversation-uuid"
}
```

History contains previous `{ "role": "user" | "assistant", "content": "..." }`
records, excluding the new message. Send at most the last ten messages. Each
message is 1–1000 characters. Do not send recommendation objects in history.
Keep `sessionId` stable within a conversation and replace it when changing persona
or starting a new conversation. The Neo4j context adapter uses it with attendee
and event IDs; it is not an authentication token.

The response is `ChatResponse`:

```ts
{
  attendeeId: string;
  eventId: string;
  goal: string;
  message: string;
  attendeeCount: number; // candidates considered, currently 99 excluding requester
  memory: "client" | "context-store";
  mode: "mock" | "qwen";
  execution: { provider: "local" | "daytona"; model?: string; sandboxId?: string };
  warning?: string;
  recommendations: Recommendation[]; // five, unique, sorted; rank begins at 1
}
```

Each recommendation includes `attendee: AttendeeProfile`, `rank`, `score` (0–100
relevance, not probability), `reasons[]`, `matchedOn[]`, `mutualValue`, and
`conversationStarter`. Render these as text; do not execute or inject model HTML.
Cards and attendee dialogs can use the returned profile without another fetch.

Show the returned `warning` and actual execution label. Configured provider
failures return an error; the server does not substitute fake live results.
Show loading/retry, and discard stale responses after switching personas.

## Meeting requests

`POST /api/meeting-requests`, `Content-Type: application/json`:

```json
{
  "attendeeId": "alex",
  "recipientId": "maya",
  "message": "Would you like to meet after the session?"
}
```

Message is 1–1000 characters. Response:

```ts
{
  request: {
    id: string;
    eventId: string;
    fromAttendeeId: string;
    toAttendeeId: string;
    message: string;
    status: "pending";
    createdAt: string; // ISO date
    delivery: "demo";
  }
  duplicate: boolean;
}
```

201 means created; 200 means the same sender/recipient/event already has a request.
Keep the original request when `duplicate` is true. Display **Request saved in demo
inbox**, rather than claiming real delivery or acceptance. Refresh outgoing state
with `GET /api/meeting-requests?attendeeId=alex` → `{requests: MeetingRequest[], mode:"demo"}`.
The endpoint lists outgoing requests only; it is not an authenticated inbox.

## Readiness and optional voice

`GET /api/status` returns configuration only:

```ts
{
  llm: {
    configured: boolean;
    model: string | null;
  }
  daytona: {
    configured: boolean;
  }
  voice: {
    configured: boolean;
    model: string | null;
    available: boolean;
  }
  mode: "mock" | "qwen";
  execution: "local" | "daytona";
}
```

Keep voice disabled while `voice.available` is false. `/api/voice/session` is an
optional server relay seam. `src/lib/voice/client.ts` supplies a reusable connection
helper for the final UI:

```ts
const voice = createVoiceConnection({
  captureMicrophone: false,
  onEvent: (event) => {
    /* render supported Qwen events */
  },
});
await voice.ready;
voice.close();
```

Default behavior requests no microphone and plays no audio. For a user-initiated
audio call, explicitly set `captureMicrophone:true`, `playRemoteAudio:true`, and
pass a caller-owned `audioElement`. `ready` means transport/data channel connected;
it does not prove audible playback. Wire microphone controls, visible call state,
event handling, and teardown in the final UI before advertising voice availability.
Never put a long-lived provider key in a client component or client environment.

Live transport was verified with Qwen's `session.created` event and both data
channels connected, with no microphone capture. Voice still needs recommendation
tool/context wiring; it currently does not automatically call `/api/chat`.

Errors use `{error:string}`. Chat: 400 invalid input/JSON, 404 missing persona,
413 oversized body, 415 media type, 502 execution failure. Meeting requests add
409 cross-event and 503 unavailable storage. Status can return 503 for invalid
configuration. Unsupported methods return 405.

Legacy `POST /api/recommendations` remains an offline deterministic endpoint with
`{attendeeId,goal,limit}`; use `/api/chat` for the live Qwen/Daytona demo workflow.
