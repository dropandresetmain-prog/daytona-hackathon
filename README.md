# Common Ground

Minimal Next.js App Router + TypeScript event networking demo for a two-hour hackathon.
All attendees, companies, and recommendations are fictional. There is no auth,
database, or LLM. When `DAYTONA_API_KEY` is set, ranking runs in a Daytona
sandbox. Otherwise it runs on this machine.

## Run

Requires Node.js 22.13+ and npm (Node.js 24 recommended).

```powershell
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Choose a fictional profile, enter a
goal, and click **Find my connections**. Try `funding`, then `design`, to see the
keyword-based results change.

Put `DAYTONA_API_KEY` in `.env` (see `.env.example`) to run that ranker in Daytona.
The browser posts to `POST /api/recommendations`. The route loads the fictional
profiles, strips email and phone, and uses `@daytona/sdk` to run
`src/lib/recommendations/rank.mjs` in a sandbox named `common-ground-ranker`.
The sandbox is reused and auto-stops after 30 idle minutes. The first request
can take about a minute while the sandbox starts. Set `RECOMMENDATION_MODE=mock`
to keep ranking on this machine even when the key is present. Never commit `.env`
or use `NEXT_PUBLIC_` for the key.

## Checks

```powershell
npm run lint
npm run typecheck
npm run build
npm run test:smoke
npm start
```

The smoke suite requires a completed build, starts its own production server on a
free local port, checks the page/API, and stops the server. `npm start` is only for
running the production demo yourself.

If this Windows machine's global npm shim fails with `Cannot find module ...npm-cli.js`,
use the bundled CLI instead (adjust the Node install directory if necessary):

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' ci
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run dev
```

## Contract and API

`src/lib/types.ts` is authoritative. `Attendee` contains `id`, `eventId`, `name`,
optional `email`/`phone`, `company`, `position`, `industry`, `lookingFor[]`,
`canOffer[]`, `skills[]`, `bio`, optional `interests[]` and `linkedinUrl`.
Recommendation profiles omit email/phone. Fixtures are in `src/lib/mock-data.ts`.

`POST /api/recommendations`, with `Content-Type: application/json`:

```json
{ "attendeeId": "alex", "goal": "Find funding", "limit": 3 }
```

`attendeeId` is required (1–100 characters), `goal` is required (1–500 characters),
and `limit` is an integer from 1–10 (defaults to 3). Blank strings are rejected.

```json
{
  "attendeeId": "alex",
  "eventId": "demo-event",
  "goal": "Find funding",
  "mode": "daytona",
  "recommendations": [
    {
      "rank": 1,
      "attendee": { "...": "AttendeeProfile; see src/lib/types.ts" },
      "score": 55,
      "reasons": ["Offers funding, which you are looking for."],
      "matchedOn": ["Funding"],
      "mutualValue": "A profile-based description of what each person can offer.",
      "conversationStarter": "A suggested introduction based on the profile."
    }
  ]
}
```

The response above illustrates the shape; it is not an exact fixture response.
`mode` is `daytona` when the sandbox ranker ran, and `mock` when ranking stayed
on this machine. Results are sorted by score descending, then attendee ID for
stable ties, exclude the requester, stay within their event, and may return
fewer than `limit`.
Scores (0–100) are simple weighted tag overlaps and literal goal keywords, not
probabilities or evidence of real compatibility. Zero-overlap candidates are
explicitly described as exploratory introductions.

Errors use `{ "error": "message" }`: 400 invalid input/JSON, 404 unknown attendee,
415 wrong media type, 500 unexpected recommendation failure. Other methods return 405. This is an unauthenticated local demo, not a deployment for real attendee data.

## Integration handoff

- `src/lib/integrations/contracts.ts`: `AttendeeRepository` and
  `RecommendationRanker` interfaces, including `RankingContext`.
- `src/lib/recommendations/service.ts`: currently composes the mock repository
  and ranker. Change dependency wiring here after reviewing teammate integrations.
- `src/lib/integrations/neo4j.ts`: unimplemented adapter for the database teammate.
  No driver, graph schema, seeding, or Cypher is included.
- `src/lib/integrations/llm.ts`: unimplemented ranking adapter. No SDK or fallback
  to an external provider.
- `src/lib/integrations/daytona.ts`: creates or reuses the ranker sandbox and
  executes `src/lib/recommendations/rank.mjs` there. The server reattaches
  profiles by id after the sandbox returns scores.
- `skills/networking/SKILL.md`: handoff placeholder only. The skill teammate owns
  its networking guidance; the app does not load it yet.

The Neo4j and LLM adapters throw explicit errors if called. Before switching from mocks, validate
provider output against the response contract, preserve event isolation, review
what profile data leaves the app, and replace the mock mode label accurately.
Persistence, registration, messaging, and production hardening are outside this scaffold.
