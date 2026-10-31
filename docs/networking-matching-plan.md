# Matching skill integration and follow-ups

The runtime guidance is `skills/networking/SKILL.md`, adapted from the supplied
AI Event User Matching skill to the current Common Ground demo. It preserves
reciprocal matching, grounded explanations, and cautious treatment of weak
evidence. It does not introduce another attendee schema or implement a ranking
algorithm by being loaded into a prompt.

## Current integration

- `src/lib/types.ts` owns `Attendee`, `AttendeeProfile`, recommendations, and chat.
- `src/lib/integrations/contracts.ts` owns repository reads and ranker input.
- `src/lib/integrations/llm.ts` builds the model payload and validates its output.
- `src/lib/integrations/networking-executor.ts` reads the skill per Qwen request,
  includes at most 24,000 characters, and selects local or Daytona execution.
- `src/lib/chat/service.ts` scopes candidates, supplies bounded conversation
  context, and requires exactly `min(5, candidateCount)` recommendations.
- `src/lib/recommendations/results.ts` attaches canonical public profiles and
  sorts by score, then ID. Model-created profiles never replace repository data.

The skill applies only to the Qwen execution path. Offline keyword matching does
not read it. Provider failures remain errors rather than silent mock success.
Chat history is conversation context, not structured profile or preference state.
Meeting requests remain a separate demo persistence operation, with no delivery
or acceptance implied by a generated recommendation.

## Decisions for this milestone

**Ignore / Accept Risk: keep the agreed contract and fixed result count.** Existing
text fields carry needs, offers, and professional context. Weak matches are marked
exploratory in the existing explanation fields. This avoids breaking the frontend
and repository integration, but five results can include uncertain introductions.
Scores in Qwen mode remain model judgments, not deterministic or calibrated values.

**Act Now, completed: validate the server boundaries offline.** Unit checks cover
event isolation, private-contact stripping, canonical profiles, invalid output,
incorrect counts, duplicate handling, goal refinement, context storage, and error
propagation. Skill frontmatter, prompt inclusion, and the 24,000-character limit
are integration details to preserve when changing the prompt or skill loader.
Stubbed responses verify plumbing; they do not prove the model follows reciprocal
reasoning or resists prompt injection. A later explicit live evaluation should
review those behaviors without treating fluent explanations as evidence of truth.

## Follow-up work requiring a separate scope

| Classification                             | Work and reason                                                                                                                                                                       | Risk of deferring                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Investigate Now, before real attendee data | Define consent, discoverability, model processing, blocks, and field sharing. Enforce eligibility in server retrieval before any model call; never infer consent from missing fields. | Real profiles could be exposed or processed without the intended permissions. The current data is fictional. |
| Park for Later                             | Implement deterministic reciprocal features and versioned weights in code before adopting the original formulas. Use a separately validated explanation stage.                        | Qwen scores vary and lack inspectable arithmetic.                                                            |
| Park for Later                             | Decide whether quality thresholds may return fewer results. Update the parser, chat service, frontend contract, and tests together.                                                   | Fixed-count results can include weak fits.                                                                   |
| Park for Later                             | Introduce structured taxonomy, source evidence, and provenance through an agreed adapter/schema change. Validate extraction and preserve user-authored text.                          | Free-text matching can miss synonyms and overinterpret claims.                                               |
| Park for Later                             | Add geography, languages, availability, and relationship requirements only with explicit data and enforcement semantics.                                                              | The demo cannot guarantee meeting feasibility or apply these hard filters.                                   |
| Park for Later                             | Add authenticated profile/preference writes with add/replace/remove intent, confirmation where needed, and clear persistence semantics. Keep them separate from chat history.         | Preferences are conversational refinements rather than durable edits.                                        |
| Park for Later                             | Add numeric confidence only after defining evidence coverage and evaluating calibration. Extend the response and UI together.                                                         | Users have textual uncertainty, without calibrated confidence.                                               |
| Park for Later                             | Add exposure/outcome events, feedback semantics, diversity constraints, and evaluation fixtures. Define ordering relative to final server sorting.                                    | Relevance, popularity bias, and mutual outcomes remain unmeasured.                                           |
| Park for Later                             | Add versioned caches or embeddings after measured latency or recall problems. Include consent invalidation and failure behavior in their design.                                      | Requests repeat work; large-event recall and latency are unproven.                                           |

The original four-hour build schedule, exact formulas, metrics, and production
checklists are design material rather than runtime instructions. No two-second
latency promise, confidence calibration, telemetry, repair loop, or automatic
fallback is implemented by this skill change. Do not expand authentication, graph
schema, onboarding, or real delivery as part of the skill integration.
