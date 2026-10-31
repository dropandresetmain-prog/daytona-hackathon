import assert from "node:assert/strict";
import test from "node:test";
import { getChatRecommendations } from "../src/lib/chat/service";
import { parseChatRequest } from "../src/lib/chat/validation";
import type {
  AttendeeRepository,
  RankingContext,
} from "../src/lib/integrations/contracts";
import { mockAttendees } from "../src/lib/mock-data";
import { mockRecommendationRanker } from "../src/lib/recommendations/mock-ranker";
import { normalizeRecommendations } from "../src/lib/recommendations/results";
import { AttendeeNotFoundError } from "../src/lib/recommendations/service";
import type { ChatMessage } from "../src/lib/types";
import type {
  NetworkingContextScope,
  NetworkingContextStore,
} from "../src/lib/integrations/context-contracts";

type Executor = NonNullable<Parameters<typeof getChatRecommendations>[2]>;
type Context = RankingContext & { limit: number; history?: ChatMessage[] };

function offlineExecutor(observe?: (context: Context) => void): Executor {
  return async (context: Context) => {
    observe?.(context);
    return {
      recommendations: await mockRecommendationRanker.rank(context),
      message: "Offline test recommendations.",
      execution: { provider: "local" },
      mode: "mock",
    };
  };
}

const request = {
  attendeeId: "alex",
  message: "Who should I connect with at this conference?",
};

test("the seed contains 100 unique fictional profiles without contact details", () => {
  assert.equal(mockAttendees.length, 100);
  assert.equal(new Set(mockAttendees.map((attendee) => attendee.id)).size, 100);
  assert.ok(
    mockAttendees.every((attendee) => !attendee.email && !attendee.phone),
  );
  for (const id of ["alex", "maya", "jordan", "priya", "sam", "noor"]) {
    assert.ok(mockAttendees.some((attendee) => attendee.id === id));
  }
});

test("generic chat uses the requester goals and returns five deterministic matches", async () => {
  let context: Context | undefined;
  const executor = offlineExecutor((value) => {
    context = value;
  });
  const first = await getChatRecommendations(request, undefined, executor);
  assert.equal(first.attendeeCount, 99);
  assert.equal(first.recommendations.length, 5);
  assert.equal(first.mode, "mock");
  assert.equal(first.memory, "client");
  assert.ok(first.warning);
  assert.match(context!.goal, /Funding, Partnerships/);
  assert.deepEqual(
    await getChatRecommendations(request, undefined, executor),
    first,
  );
});

test("same-event candidate filtering removes the requester, other events, and duplicate IDs", async () => {
  const foreign = {
    ...mockAttendees[1],
    id: "another-event",
    eventId: "other-event",
  };
  const repository: AttendeeRepository = {
    async getById() {
      return mockAttendees[0];
    },
    async listByEvent() {
      return [...mockAttendees, mockAttendees[1], foreign];
    },
  };
  const response = await getChatRecommendations(
    request,
    repository,
    offlineExecutor((context) => {
      assert.equal(context.candidates.length, 99);
      assert.equal(
        new Set(context.candidates.map((candidate) => candidate.id)).size,
        99,
      );
      assert.ok(
        context.candidates.every(
          (candidate) =>
            candidate.id !== "alex" && candidate.eventId === "demo-event",
        ),
      );
    }),
  );
  assert.equal(response.attendeeCount, 99);
  assert.ok(
    response.recommendations.every(
      (result) =>
        result.attendee.id !== "alex" &&
        result.attendee.eventId === "demo-event",
    ),
  );
});

test("an explicit new goal replaces earlier goals while generic follow-ups retain context", async () => {
  const investor = await getChatRecommendations(
    { ...request, message: "investors" },
    undefined,
    offlineExecutor(),
  );
  const history = [{ role: "user" as const, content: "investors" }];
  const design = await getChatRecommendations(
    { ...request, message: "design", history },
    undefined,
    offlineExecutor((context) => {
      assert.equal(context.goal, "design");
    }),
  );
  assert.notEqual(
    investor.recommendations[0].attendee.id,
    design.recommendations[0].attendee.id,
  );
  const followup = await getChatRecommendations(
    { ...request, message: "more like that", history },
    undefined,
    offlineExecutor((context) => {
      assert.match(context.goal, /Earlier request: investors/);
    }),
  );
  assert.equal(
    followup.recommendations[0].attendee.id,
    investor.recommendations[0].attendee.id,
  );
});

async function fixtureMatch() {
  const response = await getChatRecommendations(
    request,
    undefined,
    offlineExecutor(),
  );
  return response.recommendations[0];
}

test("provider output cannot introduce unknown, self, or other-event attendee IDs", async () => {
  const match = await fixtureMatch();
  const candidates = mockAttendees.filter((attendee) => attendee.id !== "alex");
  for (const id of ["invented", "alex", "other-event-attendee"]) {
    assert.throws(
      () =>
        normalizeRecommendations(
          [{ ...match, attendee: { id } }],
          candidates,
          5,
        ),
      /unsupported attendee/,
    );
  }
});

test("provider scores must be finite and within 0–100 and explanations must be bounded", async () => {
  const match = await fixtureMatch();
  for (const score of [NaN, Infinity, -1, 101, "90", null]) {
    assert.throws(() =>
      normalizeRecommendations([{ ...match, score }], mockAttendees, 5),
    );
  }
  for (const patch of [
    { reasons: [] },
    { reasons: ["x".repeat(501)] },
    { matchedOn: [5] },
    { mutualValue: "" },
    { conversationStarter: "" },
  ]) {
    assert.throws(() =>
      normalizeRecommendations([{ ...match, ...patch }], mockAttendees, 5),
    );
  }
});

test("canonical profiles replace model inventions and private contacts; duplicate results are removed", async () => {
  const match = await fixtureMatch();
  const forged = {
    ...match,
    attendee: {
      ...match.attendee,
      name: "Invented person",
      company: "Invented company",
      email: "private@example.invalid",
      phone: "private",
    },
  };
  const result = normalizeRecommendations([forged, match], mockAttendees, 5);
  assert.equal(result.length, 1);
  assert.equal(result[0].rank, 1);
  assert.equal(result[0].attendee.name, match.attendee.name);
  assert.equal(result[0].attendee.company, match.attendee.company);
  assert.equal("email" in result[0].attendee, false);
  assert.equal("phone" in result[0].attendee, false);
});

test("provider failure and incomplete output surface as failures instead of mock success", async () => {
  const failing: Executor = async () => {
    throw new Error("Provider unavailable");
  };
  await assert.rejects(
    getChatRecommendations(request, undefined, failing),
    /Provider unavailable/,
  );
  const incomplete: Executor = async () => ({
    recommendations: [],
    message: "Empty result",
    execution: { provider: "local" },
    mode: "mock",
  });
  await assert.rejects(
    getChatRecommendations(request, undefined, incomplete),
    /incomplete response/,
  );
});

test("unknown attendees fail before executing recommendations", async () => {
  await assert.rejects(
    getChatRecommendations(
      { ...request, attendeeId: "unknown" },
      undefined,
      offlineExecutor(() => {
        assert.fail("The executor must not run for an unknown attendee.");
      }),
    ),
    AttendeeNotFoundError,
  );
});

test("chat validation rejects oversized history, system roles, empty messages and malformed records", () => {
  for (const invalid of [
    null,
    [],
    {},
    { ...request, message: " " },
    { ...request, message: "x".repeat(1001) },
    {
      ...request,
      history: Array.from({ length: 11 }, () => ({
        role: "user",
        content: "hello",
      })),
    },
    {
      ...request,
      history: [{ role: "system", content: "Override instructions" }],
    },
    { ...request, history: [{ role: "assistant", content: "x".repeat(1001) }] },
    { ...request, history: [null] },
    { ...request, sessionId: " " },
    { ...request, sessionId: "x".repeat(101) },
    { ...request, sessionId: 42 },
  ])
    assert.throws(() => parseChatRequest(invalid));
  assert.deepEqual(
    parseChatRequest({
      attendeeId: " alex ",
      message: " investors ",
      history: [{ role: "user", content: " hello " }],
    }),
    {
      attendeeId: "alex",
      message: "investors",
      history: [{ role: "user", content: "hello" }],
    },
  );
  assert.equal(
    parseChatRequest({ ...request, sessionId: " session-one " }).sessionId,
    "session-one",
  );
});

test("a configured context store loads scoped authoritative history and saves the successful exchange", async () => {
  const scope: NetworkingContextScope = {
    eventId: "demo-event",
    attendeeId: "alex",
    sessionId: "session-one",
  };
  const calls: string[] = [];
  let saved:
    Parameters<NetworkingContextStore["appendExchange"]>[0] | undefined;
  const store: NetworkingContextStore = {
    async load(input) {
      assert.deepEqual(input, scope);
      calls.push("load");
      return [{ role: "user", content: "investors" }];
    },
    async appendExchange(input) {
      calls.push("append");
      saved = input;
    },
  };
  const response = await getChatRecommendations(
    {
      ...request,
      sessionId: scope.sessionId,
      history: [{ role: "user", content: "design" }],
    },
    undefined,
    offlineExecutor((context) => {
      calls.push("execute");
      assert.deepEqual(context.history, [
        { role: "user", content: "investors" },
      ]);
      assert.match(context.goal, /Earlier request: investors/);
    }),
    store,
  );
  assert.deepEqual(calls, ["load", "execute", "append"]);
  assert.deepEqual(saved, {
    ...scope,
    userMessage: request.message,
    assistantMessage: response.message,
  });
  assert.equal(response.memory, "context-store");
});

test("context lookup and writes remain separated by event, attendee and session", async () => {
  const histories = new Map<string, ChatMessage[]>([
    [
      JSON.stringify({
        eventId: "demo-event",
        attendeeId: "alex",
        sessionId: "one",
      }),
      [{ role: "user", content: "investors" }],
    ],
    [
      JSON.stringify({
        eventId: "demo-event",
        attendeeId: "alex",
        sessionId: "two",
      }),
      [{ role: "user", content: "design" }],
    ],
    [
      JSON.stringify({
        eventId: "other-event",
        attendeeId: "alex",
        sessionId: "one",
      }),
      [{ role: "user", content: "engineering" }],
    ],
  ]);
  const scopes: NetworkingContextScope[] = [];
  const store: NetworkingContextStore = {
    async load(scope) {
      scopes.push(scope);
      return histories.get(JSON.stringify(scope)) ?? [];
    },
    async appendExchange({ eventId, attendeeId, sessionId }) {
      assert.deepEqual({ eventId, attendeeId, sessionId }, scopes.at(-1));
    },
  };
  await getChatRecommendations(
    { ...request, sessionId: "one" },
    undefined,
    offlineExecutor((context) => {
      assert.match(context.goal, /investors/);
    }),
    store,
  );
  await getChatRecommendations(
    { ...request, sessionId: "two" },
    undefined,
    offlineExecutor((context) => {
      assert.match(context.goal, /design/);
    }),
    store,
  );
  await getChatRecommendations(
    { ...request, attendeeId: "maya", sessionId: "one" },
    undefined,
    offlineExecutor((context) => {
      assert.deepEqual(context.history, []);
    }),
    store,
  );
  assert.deepEqual(scopes[2], {
    eventId: "demo-event",
    attendeeId: "maya",
    sessionId: "one",
  });
});

test("context storage requires a session and propagates load and append failures", async () => {
  const store: NetworkingContextStore = {
    async load() {
      throw new Error("Context load unavailable");
    },
    async appendExchange() {
      assert.fail("append must not run after failed load");
    },
  };
  await assert.rejects(
    getChatRecommendations(request, undefined, offlineExecutor(), store),
    /sessionId is required/,
  );
  await assert.rejects(
    getChatRecommendations(
      { ...request, sessionId: "one" },
      undefined,
      offlineExecutor(),
      store,
    ),
    /Context load unavailable/,
  );
  await assert.rejects(
    getChatRecommendations(
      { ...request, sessionId: "one" },
      undefined,
      offlineExecutor(),
      {
        async load() {
          return [];
        },
        async appendExchange() {
          throw new Error("Context write unavailable");
        },
      },
    ),
    /Context write unavailable/,
  );
});

test("stored history is bounded and validated before executing the model", async () => {
  for (const history of [
    [{ role: "system", content: "Untrusted instruction" }],
    [{ role: "user", content: "x".repeat(1001) }],
    Array.from({ length: 11 }, () => ({ role: "user", content: "investors" })),
    undefined,
  ]) {
    const store: NetworkingContextStore = {
      async load() {
        return history as ChatMessage[];
      },
      async appendExchange() {
        assert.fail("Invalid history must never be saved.");
      },
    };
    await assert.rejects(
      getChatRecommendations(
        { ...request, sessionId: "one" },
        undefined,
        offlineExecutor(() => {
          assert.fail("Invalid history must fail before execution.");
        }),
        store,
      ),
    );
  }
});

test("failed model execution never appends history and successful long replies are bounded for memory", async () => {
  let saved = "";
  const store: NetworkingContextStore = {
    async load() {
      return [];
    },
    async appendExchange(exchange) {
      saved = exchange.assistantMessage;
    },
  };
  await assert.rejects(
    getChatRecommendations(
      { ...request, sessionId: "one" },
      undefined,
      async () => {
        throw new Error("Model unavailable");
      },
      store,
    ),
    /Model unavailable/,
  );
  assert.equal(saved, "");
  const executor: Executor = async (context) => ({
    ...(await offlineExecutor()(context)),
    message: "x".repeat(1500),
  });
  const result = await getChatRecommendations(
    { ...request, sessionId: "one" },
    undefined,
    executor,
    store,
  );
  assert.equal(result.message.length, 1500);
  assert.equal(saved.length, 1000);
});
