import {
  getAttendeeRepository,
  getNetworkingContextStore,
} from "@/lib/integrations/data-sources";
import type {
  NetworkingContextScope,
  NetworkingContextStore,
} from "@/lib/integrations/context-contracts";
import type { executeNetworking } from "@/lib/integrations/networking-executor";
import { AttendeeNotFoundError } from "@/lib/recommendations/service";
import {
  InvalidRecommendationError,
  normalizeRecommendations,
} from "@/lib/recommendations/results";
import type { AttendeeRepository } from "@/lib/integrations/contracts";
import type { ChatRequest, ChatResponse } from "@/lib/types";
import { parseChatHistory } from "./validation";

export class SessionRequiredError extends Error {}

const conversationalWords = new Set(
  "hey hi hello please thanks thank you who what whom should could would can will do does i we me my us our at in this the a an conference event connect connection connections network networking meet meeting recommend recommends recommendations find best top five 5 people person attendees attendee with to for and some someone like that those more instead now here are is it want looking talk show give again".split(
    " ",
  ),
);

function hasSpecificGoal(message: string): boolean {
  return (message.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).some(
    (word) => !conversationalWords.has(word),
  );
}

export async function getChatRecommendations(
  request: ChatRequest,
  repository: AttendeeRepository = getAttendeeRepository(),
  executor?: typeof executeNetworking,
  contextStore: NetworkingContextStore | null = getNetworkingContextStore(),
): Promise<ChatResponse> {
  const attendee = await repository.getById(request.attendeeId);
  if (!attendee) throw new AttendeeNotFoundError("Attendee not found.");
  if (contextStore && !request.sessionId?.trim())
    throw new SessionRequiredError(
      "sessionId is required when conversation context storage is enabled.",
    );
  const scope: NetworkingContextScope | undefined = request.sessionId
    ? {
        eventId: attendee.eventId,
        attendeeId: attendee.id,
        sessionId: request.sessionId,
      }
    : undefined;
  // A configured store is authoritative. Client history cannot inject messages
  // into a different persisted conversation or conceal context adapter failures.
  const loadedHistory = contextStore
    ? await contextStore.load(scope!)
    : request.history;
  if (contextStore && !Array.isArray(loadedHistory))
    throw new Error("Context storage returned invalid conversation history.");
  const history = parseChatHistory(loadedHistory);
  const candidates = [
    ...new Map(
      (await repository.listByEvent(attendee.eventId))
        .filter(
          (candidate) =>
            candidate.id !== attendee.id &&
            candidate.eventId === attendee.eventId,
        )
        .map((candidate) => [candidate.id, candidate]),
    ).values(),
  ];
  // Explicit new goals replace old goals; short follow-ups retain the last specific request.
  const previousGoal = history
    .filter((item) => item.role === "user" && hasSpecificGoal(item.content))
    .at(-1)?.content;
  const goal = hasSpecificGoal(request.message)
    ? request.message
    : `${request.message}\n${previousGoal ? `Earlier request: ${previousGoal}` : `My networking interests: ${attendee.lookingFor.join(", ")}`}`;
  const execute =
    executor ??
    (await import("@/lib/integrations/networking-executor")).executeNetworking;
  const result = await execute({
    attendee,
    candidates,
    goal,
    limit: 5,
    history,
  });
  const recommendations = normalizeRecommendations(
    result.recommendations,
    candidates,
    5,
  );
  if (
    recommendations.length !== Math.min(5, candidates.length) ||
    typeof result.message !== "string" ||
    !result.message.trim() ||
    result.message.length > 4000
  ) {
    throw new InvalidRecommendationError(
      "The recommendation provider returned an incomplete response.",
    );
  }
  if (contextStore) {
    await contextStore.appendExchange({
      ...scope!,
      userMessage: request.message,
      assistantMessage: result.message.slice(0, 1000),
    });
  }
  return {
    attendeeId: attendee.id,
    eventId: attendee.eventId,
    goal: request.message,
    mode: result.mode,
    message: result.message,
    attendeeCount: candidates.length,
    memory: contextStore ? "context-store" : "client",
    execution: result.execution,
    recommendations,
    ...(result.mode === "mock"
      ? {
          warning:
            "Local rules: recommendations use deterministic profile matching, not LLM reasoning.",
        }
      : {}),
  };
}
