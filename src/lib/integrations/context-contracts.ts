import type { ChatMessage } from "@/lib/types";

export interface NetworkingContextScope {
  eventId: string;
  attendeeId: string;
  sessionId: string;
}

export interface NetworkingContextStore {
  // Return the most recent 10 messages, oldest first, with at most 1000
  // characters per message. All three scope fields must constrain the query.
  load(scope: NetworkingContextScope): Promise<ChatMessage[]>;
  // The service saves bounded message snippets after a validated recommendation.
  // Append both messages together; failures must reject instead of being ignored.
  appendExchange(
    exchange: NetworkingContextScope & {
      userMessage: string;
      assistantMessage: string;
    },
  ): Promise<void>;
}
