# Attendee CSV integration

The app automatically loads `data/attendees.csv`: the supplied SWITCH export with
40 synthetic profiles. No database or import command is required. The chatbot,
recommendations, and meeting APIs all use the same repository. Conversation history
is separate and stays bounded in the browser.

To use the alternative fixture dataset, set `ATTENDEE_DATA_SOURCE=mock`. This
selects 100 fictional profiles even when a CSV is present. It changes the data,
not the inference provider; see [offline execution](setup.md#run-offline-deliberately).

To select a CSV explicitly, add these values to the ignored `.env.local`, then
restart Next.js. Change the path to use a different export:

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

Run `npm run test:unit` for CSV parsing, the supplied dataset's five-match flow,
event isolation, source selection, and missing-file checks, along with the engine
and voice unit tests. The smoke suite explicitly selects mock fixtures and local
execution, so its results stay deterministic while the CSV is installed.
