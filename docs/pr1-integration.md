# PR #1 integration decisions

Historical integration note: reviewed head `48b77f3` from `dev_zihao`. The visual
design was ported onto the existing backend through `codex/demo-ui-integration`,
then integrated into main in `b974e3e`. PR #1's alternate backend was excluded.
For the current demo and setup, start with the [README](../README.md).

| Decision                                                   | Classification       | Reason and consequence                                                                                                                                |
| ---------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port dark layout, aurora, persona ticket, and result cards | Act Now, completed   | Preserves the teammate's UI direction while keeping existing chat and meeting behavior.                                                               |
| Keep our Qwen/Daytona executor and skill loading           | Act Now, completed   | PR #1's independent keyword runner and execution contract would replace the live backend. Importing it would lose the agreed inference path.          |
| Add chatbot and top-five cards to the ported UI            | Act Now, completed   | PR #1 only called the legacy recommendations endpoint and requested three results. Our UI uses `/api/chat` and five canonical results.                |
| Load supplied CSV through the repository interface         | Act Now, completed   | Neo4j is unnecessary for this demo. All APIs share the same dataset and IDs.                                                                          |
| Wire Omni recommendation tool to `/api/chat`               | Act Now, implemented | Voice has no independent ranking path and cannot send meetings. Browser microphone/audio verification remains a manual demo check.                    |
| Authentication and real notification delivery              | Park for Later       | Demo identity is selectable and requests stay in one local file. This is suitable for local testing; it is not ready for public multi-user operation. |
| System font in place of remote font download               | Ignore / Accept Risk | Keeps installation/build independent of Google Fonts. Typography differs slightly from PR #1.                                                         |

The skill commit `2587257` was fast-forwarded and pushed to main before this
integration work. The teammate's skill content is unchanged. The CSV export is
synthetic; the app makes no claims of real attendees or verified availability.
