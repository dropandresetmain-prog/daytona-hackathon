# Attendee CSV integration

The attendee repository accepts a server-only UTF-8 CSV without Neo4j. The chatbot, recommendation and meeting APIs keep their existing contracts. Conversation context continues to use bounded client history; this adapter does not persist context.

For the simulated local demo, set `ATTENDEE_DATA_SOURCE=mock`. This selects the 100 fictional seeded profiles even if a CSV or credentials are present. LLM mode and execution settings are independent.

To use the teammate export, add these values to the ignored `.env.local`, then restart Next.js:

```dotenv
ATTENDEE_DATA_SOURCE=csv
ATTENDEES_CSV_PATH=data/attendees.csv
ATTENDEES_EVENT_ID=demo-event
ATTENDEES_EVENT_NAME=SWITCH
```

Paths can be absolute or relative to the project root. With no source override, the repository uses a configured path, then auto-detects `data/attendees.csv`, otherwise uses mock fixtures. An explicitly configured missing, unreadable or invalid CSV fails; it never silently substitutes fictional attendees. A successfully loaded CSV is cached until the app restarts.

The supplied `switch_2026_attendees.csv` is installed unchanged as `data/attendees.csv`.
It has 40 unique `participant_id` values and all rows are marked `Synthetic`.
The default page therefore uses 40 profiles and considers 39 candidates per selected
persona. `looking_for` and `skills` use semicolon lists. Missing `canOffer` and
`bio` remain empty. Source links and export metadata are not profile facts and are
not imported. No attendance, identity, or source claim is independently verified.

## Column contract

Headers ignore case, spaces, underscores and punctuation. Unrecognized columns are ignored. More than one column mapping to the same field is rejected.

| Field         | Common accepted headers                                                      | Missing value                                                                             |
| ------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `name`        | Name, Full Name, Attendee Name, Participant Name, Display Name               | Required nonempty column and value                                                        |
| `id`          | ID, Attendee ID, Participant ID                                              | Opaque deterministic hash when the column is absent; otherwise required                   |
| `eventId`     | Event ID, Conference ID                                                      | `ATTENDEES_EVENT_ID`, default `demo-event`, when the column is absent; otherwise required |
| `company`     | Company, Company Name, Organization, Organisation                            | Empty string                                                                              |
| `position`    | Position, Job Title, Title, Role, Designation                                | Empty string                                                                              |
| `industry`    | Industry, Sector                                                             | Empty string                                                                              |
| `lookingFor`  | Looking For, What You're Looking For, What You Are Looking For, Goals, Needs | Empty array                                                                               |
| `canOffer`    | Can Offer, What You Can Offer, Offers                                        | Empty array                                                                               |
| `skills`      | Skills, Expertise                                                            | Empty array                                                                               |
| `bio`         | Bio, Biography, About, Description                                           | Empty string                                                                              |
| `interests`   | Interests, Topics                                                            | Omitted                                                                                   |
| `email`       | Email, Email Address                                                         | Omitted                                                                                   |
| `phone`       | Phone, Phone Number, Mobile, Mobile Number, Contact Number                   | Omitted                                                                                   |
| `linkedinUrl` | LinkedIn URL, LinkedIn, LinkedIn Profile                                     | Omitted; supplied values require absolute HTTP(S) URLs                                    |

Array cells accept semicolon/pipe/comma lists or JSON string arrays. A comma inside a cell needs CSV quoting. JSON strings must escape quotes using normal CSV doubled quotes. The parser supports BOM, CRLF, quoted commas and embedded newlines using [csv-parse](https://csv.js.org/parse/options/). It does not infer skills, intent, biographies or other profile facts.

Provided attendee IDs must be globally unique, nonempty and at most 100 characters. Event IDs are at most 100 characters. Without an ID column, IDs derive from event, name, company, position, email and LinkedIn URL, and survive row reordering; changes to those values change the generated ID. Give identical profiles explicit distinct IDs. If the file has multiple events, set `ATTENDEES_EVENT_ID` to the event shown by the local UI; repository queries retain event isolation.

The file limit is 5 MB and 10,000 attendees; individual fields are limited to 10,000 characters and lists to 100 entries. Malformed files fail as a whole with a sanitized error; no complete CSV record or contact value is logged. Phone numbers remain strings, including leading zeros. Existing public-profile projection removes email and phone before browser and LLM payloads. CSV data has no implied verification or fictional status. CSV contact values stay server-side; separately review freeform bio content before supplying it if it contains private details.

Run `npx tsx --test tests/csv-repository.test.ts` for parser, event isolation, source selection and missing-file checks. Existing mock smoke tests must set `ATTENDEE_DATA_SOURCE=mock` alongside `NETWORKING_MODE=mock` and `NETWORKING_EXECUTION=local` so they stay deterministic when the export arrives.
