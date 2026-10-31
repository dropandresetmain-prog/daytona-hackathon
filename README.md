# Common Ground

Next.js + TypeScript conference networking demo. The default dataset is the supplied
SWITCH CSV: 40 profiles marked Synthetic. The original 100 fictional fixtures are
available with `ATTENDEE_DATA_SOURCE=mock`. No registration or profile editing.

## Demo

1. Open the chatbot from the conference page.
2. Ask **Who should I connect with at this conference?**
3. The engine considers the other 39 CSV attendees and returns five recommendations.
4. Open a recommendation, review its reasons, and send a demo meeting request.
5. The request is saved in a local demo inbox. No email or real notification is sent.

The UI incorporates PR #1's dark visual design, with chatbot, meeting requests,
and optional voice wired to our existing backend. PR #1's alternate Daytona
ranker is excluded. See [integration decisions](docs/pr1-integration.md) and
[UI contracts](docs/frontend-integration.md).

## Run

Requires Node.js 22.13+ and npm (Node.js 24 recommended).

```powershell
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The selected CSV persona defaults
to the first row. Without provider credentials, recommendations use visibly labeled local
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
inside the sandbox. The app validates the returned IDs, uses canonical repository
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

Real-time voice is optional. **Start voice** requests microphone permission and
connects Qwen Omni; controls show call state, mute, transcripts, and audio playback.
Its read-only recommendation tool calls the same `/api/chat` engine. Meeting
requests still require selecting a card and explicitly submitting the form.
Closing the assistant or switching persona stops microphone tracks. The long-lived
Alibaba key stays on the server. Availability means configured, not verified quota.

Local CSV configuration and column mapping: [docs/csv-integration.md](docs/csv-integration.md).
The checked-in dataset is synthetic demo data; no attendance or identity is verified.

Verified locally on 31 October 2026: CSV chat returned five Qwen recommendations
through Daytona, and a demo meeting request saved successfully. Omni accepted the
session/tool configuration and called the same engine, then continued its response
after receiving the five results. This voice check used a text-injected turn and
silent simulated media. Real microphone transcription and audible playback still
require a manual browser check.

## Checks

```powershell
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:smoke
```

Unit tests cover canonical model output, event isolation, context, CSV parsing,
the supplied dataset, voice protocol, lifecycle cleanup, and validation.
Smoke tests start a production server with **forced offline execution**, use an
isolated meeting store, and check chat/API errors, persistence, concurrent duplicate
requests, and corrupt-store handling. They do not make paid provider calls.

## Integration boundaries

- `src/lib/types.ts`: agreed Attendee contract and recommendation/chat types.
- `src/lib/integrations/contracts.ts`: repository and ranking interfaces.
- `src/lib/integrations/data-sources.ts`: central attendee and conversation-context bindings.
- `src/lib/integrations/csv-repository.ts`: validated CSV ingestion, no Neo4j required.
- `data/attendees.csv`: supplied 40-profile synthetic SWITCH export.
- `src/lib/mock-data.ts`: 100 fictional fixtures; no private contact data.
- `src/lib/chat/service.ts`: retrieval, goal context, execution, canonical results.
- `src/lib/integrations/networking-executor.ts`: explicit offline/Qwen/Daytona wiring.
- `src/lib/integrations/neo4j.ts`: unused placeholder; no graph connection is required.
- `skills/networking/SKILL.md`: completed teammate guidance, read per Qwen request.
- `src/components/use-networking-voice.ts`: voice controls and recommendation tool orchestration.
- `src/lib/meetings/`: validates and saves demo requests separately from recommendations.

Meeting data lives in ignored `.data/meeting-requests.json` by default. Override
`MEETING_REQUESTS_FILE` for a separate demo/test store. Repeated requests from the
same sender to the same attendee/event return the original request. The file store
supports one Node process; use a database with a unique constraint before running
multiple instances. Authentication and real message delivery are outside this demo.

Conversation history remains bounded in the browser. The optional context-store
interface remains available; no graph queries or persisted conversation store are
implemented. [docs/neo4j-integration.md](docs/neo4j-integration.md) documents that optional seam.
