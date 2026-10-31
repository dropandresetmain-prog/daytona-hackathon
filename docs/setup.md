# Setup and troubleshooting

Common Ground runs as a single Next.js app. Start with offline text matching, then
configure Qwen, Daytona, and optional voice when you are ready to test live inference.

## Start the app

Install Node.js 22.13 or newer and npm. Node.js 24 is recommended for this project.
From the repository root:

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). If that port is occupied, check the
terminal for the actual URL. The default data is the checked-in 40-profile
synthetic SWITCH CSV. No database, sign-in, or attendee registration is required.

To serve a production build locally instead of using the development server:

```sh
npm run build
npm run start
```

Use one server on a given port. Stop it with Ctrl+C before switching server modes.

## Configure live text recommendations

Create `.env.local` from `.env.example` **only if `.env.local` does not already
exist**. If it exists, edit it without replacing its saved credentials.

```dotenv
ALIBABA_CLOUD_API_KEY=your-model-studio-api-key
LLM_MODEL=qwen3.8-flash
ALIBABA_REGION=ap-southeast-1
DAYTONA_API_KEY=your-daytona-api-key
NETWORKING_MODE=qwen
NETWORKING_EXECUTION=daytona
```

Replace the example values with your own keys. The Alibaba key must have access
to the chosen model and region. The Daytona key needs permission to create, run,
and delete sandboxes. Restart the app after changing environment variables.

Each recommendation request creates a temporary Daytona sandbox and calls Qwen
from a fixed Python runner inside it. The Next.js server validates the returned
recommendations and attempts sandbox cleanup. Configured provider failures appear
as errors; the app does not silently switch to offline results.

Keys remain server-side. Do not add them to `NEXT_PUBLIC_` variables, commit
`.env.local`, or share it in screenshots.

## Enable optional voice

Add your Alibaba Model Studio workspace ID and voice model to `.env.local`:

```dotenv
ALIBABA_WORKSPACE_ID=your-workspace-id
QWEN_REALTIME_MODEL=qwen3.8-omni-flash-realtime
```

The workspace, region, key, and voice model must be compatible. The voice workspace
setting does not change the text model's regional endpoint.

Restart the app, open the assistant, and click **Start voice**. Allow microphone
access in your browser. Test on localhost or an HTTPS origin that supports
microphone access. Use **Mute microphone**, **End voice**, or the audio playback
control as needed. Closing the assistant or changing persona also ends the call.

The browser connects to Qwen Omni through a server-side SDP handshake. The
long-lived key is not returned to the browser. Recommendation tool calls use the
selected persona and the same `/api/chat` backend as text. Voice has no meeting
submission tool; use the card's explicit meeting form.

Voice connection and tool execution have been checked with simulated media.
Manually confirm both microphone transcription and audible playback before a
live presentation.

## Run offline deliberately

Without provider keys, the app defaults to local keyword matching. If credentials
are already saved, set **both** of these values to force offline text execution:

```dotenv
NETWORKING_MODE=mock
NETWORKING_EXECUTION=local
```

This keeps the supplied CSV. To use the original 100 fictional fixture profiles
instead, also set:

```dotenv
ATTENDEE_DATA_SOURCE=mock
```

These switches control text recommendations; clicking **Start voice** still
connects to the configured voice provider. Use text only for a fully offline demo.

## Configuration reference

| Variable                | Purpose                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `ALIBABA_CLOUD_API_KEY` | Model Studio key; `LLM_API_KEY` is an alternative name.                                              |
| `LLM_MODEL`             | Text model, default `qwen3.8-flash`.                                                                 |
| `ALIBABA_REGION`        | `ap-southeast-1` by default; `cn-beijing` is also accepted by the app. Must match model/key access.  |
| `ALIBABA_WORKSPACE_ID`  | Workspace for the optional voice endpoint.                                                           |
| `QWEN_REALTIME_MODEL`   | Voice model, default `qwen3.8-omni-flash-realtime`.                                                  |
| `DAYTONA_API_KEY`       | Key for sandbox execution.                                                                           |
| `DAYTONA_TARGET`        | Optional Daytona execution target.                                                                   |
| `NETWORKING_MODE`       | `qwen` or `mock`. Defaults to `qwen` when a model key is set.                                        |
| `NETWORKING_EXECUTION`  | `daytona` or `local`. Defaults to `daytona` when its key is set. Mock mode requires local execution. |
| `ATTENDEE_DATA_SOURCE`  | `csv` or `mock`. If unset, a configured CSV path or the checked-in CSV selects CSV mode.             |
| `ATTENDEES_CSV_PATH`    | Server-only path; defaults to `data/attendees.csv`.                                                  |
| `ATTENDEES_EVENT_ID`    | CSV event selection/default, `demo-event` by default.                                                |
| `ATTENDEES_EVENT_NAME`  | CSV event label, `SWITCH 2026 demo` by default.                                                      |
| `MEETING_REQUESTS_FILE` | Demo inbox file, `.data/meeting-requests.json` by default.                                           |

The `NEO4J_*` entries in `.env.example` are unused placeholders. Neo4j is not
required for this demo. See [CSV configuration](csv-integration.md) for other exports.

## Check the configuration

Open [/api/status](http://localhost:3000/api/status) to see the selected model,
execution mode, and text/voice configuration flags. It does not expose keys.
“Configured” means values are present; it does not prove valid credentials,
model access, quota, or a successful audio call.

For an operator-run live check:

```sh
npm run check:providers
```

This makes one real text inference request using the selected dataset and
execution mode. With Daytona configured, it creates a temporary sandbox. It can
incur provider charges and is intentionally separate from automated tests.

## Troubleshooting

| Symptom                               | What to check                                                                                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The app shows local matching          | Check `NETWORKING_MODE` and whether a model key is present. Restart after configuration changes.                                                                                 |
| A chat request fails                  | Check model/region access, key validity, quota, and Daytona permissions/connectivity. `/api/status` only checks configuration. Use the operator live check for text diagnostics. |
| Voice is unavailable                  | Supply a model key and workspace ID, then restart.                                                                                                                               |
| Voice does not connect                | Check workspace/model access, browser microphone permissions, and the error shown in the voice panel. Text chat is available independently.                                      |
| Voice connects but is silent          | Check the input device, mute state, speaker volume, and the audio element's play control if browser autoplay was blocked.                                                        |
| CSV changes are missing               | Restart: successfully loaded CSV data is cached. Check the selected event ID and file path.                                                                                      |
| A meeting request is already pending  | Requests are deduplicated per sender, recipient, and event. Use Reset Demo for a new scenario; it clears the shared inbox.                                                       |
| The meeting inbox cannot load or save | Check file permissions and whether the JSON store is valid. Preserve the file for diagnosis rather than overwriting it. The store supports one Node process.                     |
| The Windows npm launcher fails        | Use the bundled Node/npm command below.                                                                                                                                          |

On Windows, the bundled npm CLI can bypass a broken global launcher:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run dev
```

Use the same prefix for `ci`, `run build`, or other npm commands if needed.
