# Local attendee dataset

`attendees.csv` is the supplied `switch_2026_attendees.csv`, unchanged. It contains
40 profiles, all marked `Synthetic` in the export. The app does not verify event
attendance, identity, or the export's source links. These are demo records.

The adapter preserves `participant_id`, maps `looking_for` to `lookingFor`, and
splits semicolon lists. Missing `canOffer`, `bio`, contacts, interests, and LinkedIn
fields remain empty or omitted. `participant_type`, `source_url`, and `data_type`
are export metadata, outside the agreed Attendee contract, and are not mapped to
profile facts.

The app auto-detects this file. Set `ATTENDEE_DATA_SOURCE=mock` to use the original
100 fictional fixtures instead. See [CSV configuration](../docs/csv-integration.md).
