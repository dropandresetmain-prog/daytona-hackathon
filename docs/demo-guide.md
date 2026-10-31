# Demo guide

## The pitch

“A conference gives you a room full of people, but limited time to find the right
conversations. Common Ground lets you describe what you need and gives you five
people to meet, why the introduction could be useful to both sides, and a way to
start the conversation. Daytona runs the live recommendation request in a
temporary sandbox, and Qwen reasons over the supplied attendee profiles.”

The goal is to make a useful introduction easier. The prototype demonstrates
discovery through a saved meeting request; it does not claim measured networking
outcomes or real message delivery.

## Before presenting

- Start the app using the [setup guide](setup.md).
- Check `/api/status` and make one text request before the presentation. A live
  run needs working Qwen and Daytona keys, model access, and quota.
- Keep the supplied CSV selected: it contains 40 profiles marked Synthetic.
- Test microphone transcription and audible playback if you plan to show voice.
  The automated voice check used simulated media, so it is not proof of either.
- Use **Reset Demo** before the walkthrough. This clears the shared demo meeting
  inbox for all personas as well as the current conversation and results.

## Walkthrough

| Step               | Action                                                                               | Point to explain                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 1. Set the context | Show the selected persona and their networking needs.                                | Attendee profiles are preloaded; the user can begin immediately.                                                         |
| 2. Ask             | Open **Find my connections** and ask “Who should I connect with at this conference?” | The engine considers all 39 other profiles for this persona.                                                             |
| 3. Explain a match | Open one of the five cards.                                                          | Show the reasons, possible mutual value, and conversation starter. A score ranks relevance; it does not certify a match. |
| 4. Refine          | Ask “Prioritize people who know Python and want to collaborate on projects.”         | Goals can change within the conversation without editing the stored profile.                                             |
| 5. Act             | Edit the introduction and click **Send request to meet**.                            | The pending request is saved locally and duplicate requests are prevented. Nothing is delivered externally.              |
| 6. Optional voice  | Click **Start voice** and ask a networking question aloud.                           | Omni calls the same recommendation engine; it does not maintain a separate attendee ranking. End the call afterward.     |

Let the live request finish before moving on. Sandbox creation and model response
time contribute to latency; there is no fixed response-time guarantee. If a
provider fails, show the error honestly. For an offline fallback, stop the server,
set both offline switches from the setup guide, and restart. Describe those
results as local keyword matching.

## Questions judges may ask

**What does Daytona do?**

Each live recommendation request creates a temporary sandbox that runs a fixed
Python program to call Qwen. The app supplies profiles, goal, history, and the
networking skill. The app then validates the response and attempts to delete the
sandbox. CSV loading and meeting storage remain in Next.js. This is isolated
execution of the inference request, not execution of model-generated code.

**How are recommendations made?**

Qwen receives every candidate from the selected attendee's event. The networking
skill asks it to prefer complementary needs and contributions, ground explanations
in supplied facts, and acknowledge weak evidence. Server checks restrict results
to known, unique candidates, exclude the requester, and attach the original
profiles. The scores are model judgments, not a calibrated matching formula.

**Are these real SWITCH attendees?**

No. The supplied export marks every row Synthetic. The app uses those records for
the demo and has not verified attendance, identity, availability, or source links.

**Is the voice interface implemented?**

Yes: it includes connection state, microphone controls, transcripts, playback,
and recommendation tool calls. Connection and the tool-to-engine round trip have
been verified with simulated media. Real microphone transcription and audible
playback require the presenter's manual browser check.

**What happens when I send a meeting request?**

It is saved in a local demo file with a pending status. No email, text,
notification, scheduling, or acceptance is implemented. Voice cannot submit it;
the user must use the meeting form.

**Does it require Neo4j or a database?**

No. The current demo reads the CSV directly and keeps bounded conversation history
in the browser. An interface exists for a future context store, but none is
enabled. The meeting inbox is separate local file storage.

**What would come next?**

Evaluate recommendation quality with consented data and human feedback, then add
authenticated identity and reliable meeting delivery. Those are future steps;
they are not part of the current demo. See the
[matching notes](networking-matching-plan.md) for the technical tradeoffs.
