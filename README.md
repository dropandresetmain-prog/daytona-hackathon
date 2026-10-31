# Common Ground

Next.js + TypeScript conference networking demo. All 100 attendees and companies
are fictional seeded data; there is no registration or profile editing.

## Demo

1. Open the chatbot from the conference page.
2. Ask **Who should I connect with at this conference?**
3. The engine considers the other 99 attendees and returns five recommendations.
4. Open a recommendation, review its reasons, and send a demo meeting request.
5. The request is saved in a local demo inbox. No email or real notification is sent.

The current UI is a replaceable functional placeholder. The final UI is being
built in another lane; its contracts are in [docs/frontend-integration.md](docs/frontend-integration.md).

## Run

Requires Node.js 22.13+ and npm (Node.js 24 recommended).

```powershell
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The selected seeded persona defaults
to Alex. Without provider credentials, recommendations use visibly labeled local
keyword matching. Profile selection is a demo identity switch, not authentication.

On this Windows machine the global npm launcher may fail. Use the bundled CLI:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run dev
```

## Qwen and Daytona

Copy `.env.example` to `.env.local` only if `.env.local` does not already exist.
Keep all credentials server-side and never commit `.env.local`.

- `ALIBABA_CLOUD_API_KEY`: Alibaba Model Studio API key (`LLM_API_KEY` alias supported).
- `LLM_MODEL`: defaults to `qwen3.8-flash`.
- `ALIBABA_REGION`: `ap-southeast-1` or `cn-beijing`; must match the key.
- `ALIBABA_WORKSPACE_ID`: workspace ID for the voice endpoint; text retains its verified regional endpoint.
- `DAYTONA_API_KEY`: sandbox creation/deletion permissions required.
- `DAYTONA_TARGET`: optional Daytona execution target.
- `NETWORKING_MODE`: `qwen` or `mock`; defaults to `qwen` when a model key exists.
- `NETWORKING_EXECUTION`: `daytona` or `local`; defaults to `daytona` when its key exists.

With both keys configured, each chat request creates a temporary Daytona sandbox.
A fixed Python runner sends the complete candidate set and goal to Qwen from
inside the sandbox. The app validates the returned IDs, uses canonical seeded
profiles, and deletes the sandbox in a `finally` block. An idle stop, automatic
deletion, and sandbox TTL also constrain abandoned executions. User/model content
is never executed as code.

Configured provider failures surface as errors. They do not silently return mock
results. To deliberately run offline, set **both** switches:

```dotenv
NETWORKING_MODE=mock
NETWORKING_EXECUTION=local
```

`GET /api/status` reports selected mode and configuration readiness, never keys.
Readiness indicates configuration, not a guarantee that credentials/quota work.

The operator-only live check makes one real model request inside Daytona:

```powershell
npm run check:providers
```

Real-time voice is optional. The server-side Qwen Omni SDP relay and reusable
`src/lib/voice/client.ts` connection helper are prepared. The current placeholder
does not present a complete microphone/audio conversation, so `voice.available`
remains false. Microphone capture and remote playback require explicit opt-in;
the default helper only connects. The long-lived Alibaba key is never returned
to the browser.

Live verification on 31 October 2026: Qwen text inference ran inside Daytona and
returned five canonical recommendations; sandbox deletion was verified. Qwen Omni
WebRTC connected and emitted `session.created` without microphone capture. Audible
conversation and voice-driven recommendation tools are not implemented or verified.

## Checks

```powershell
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:smoke
```

Unit tests cover canonical model output, event isolation, context, and validation.
Smoke tests start a production server with **forced offline execution**, use an
isolated meeting store, and check chat/API errors, persistence, concurrent duplicate
requests, and corrupt-store handling. They do not make paid provider calls.

## Integration boundaries

- `src/lib/types.ts`: agreed Attendee contract and recommendation/chat types.
- `src/lib/integrations/contracts.ts`: repository and ranking interfaces.
- `src/lib/integrations/data-sources.ts`: central attendee and conversation-context
  bindings for the teammate's Neo4j/CSV branch. This branch does not implement graph queries or CSV ingestion.
- `src/lib/mock-data.ts`: 100 fictional fixtures; no private contact data.
- `src/lib/chat/service.ts`: retrieval, goal context, execution, canonical results.
- `src/lib/integrations/networking-executor.ts`: explicit offline/Qwen/Daytona wiring.
- `src/lib/integrations/neo4j.ts`: still a placeholder; graph and context persistence belong to the database teammate.
- `skills/networking/SKILL.md`: still the skill teammate's placeholder. Once replaced
  with guidance, Qwen mode reads it per request and includes it in the system prompt.
- `src/lib/meetings/`: validates and saves demo requests separately from recommendations.

Meeting data lives in ignored `.data/meeting-requests.json` by default. Override
`MEETING_REQUESTS_FILE` for a separate demo/test store. Repeated requests from the
same sender to the same attendee/event return the original request. The file store
supports one Node process; use a database with a unique constraint before running
multiple instances. Authentication and real message delivery are outside this demo.

See [docs/neo4j-integration.md](docs/neo4j-integration.md) for context scoping,
adapter contracts, and the merge handoff.
