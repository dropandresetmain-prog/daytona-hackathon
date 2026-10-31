"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import type {
  AttendeeProfile,
  ChatResponse,
  Recommendation,
} from "@/lib/types";
import type { MeetingRequest } from "@/lib/meeting-types";

type Message = {
  role: "user" | "assistant";
  content: string;
  result?: ChatResponse;
};
type Status = {
  llm: { configured: boolean; model: string | null };
  daytona: { configured: boolean };
  voice: { configured: boolean; model: string | null; available: boolean };
  mode: "mock" | "qwen";
  execution: "local" | "daytona";
};
interface Props {
  event: { name: string; description: string };
  attendees: AttendeeProfile[];
}
const firstQuestion = "Who should I connect with at this conference?";

export function NetworkingApp({ event, attendees }: Props) {
  const [attendeeId, setAttendeeId] = useState(
    attendees.find((person) => person.id === "alex")?.id ??
      attendees[0]?.id ??
      "",
  );
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState<Recommendation | null>(null);
  const [meetingMessage, setMeetingMessage] = useState("");
  const [requests, setRequests] = useState<MeetingRequest[]>([]);
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingError, setMeetingError] = useState("");
  const [inboxError, setInboxError] = useState("");
  const [meetingNotice, setMeetingNotice] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [voiceMessage, setVoiceMessage] = useState("");
  const [voiceLoading, setVoiceLoading] = useState(false);
  const requestVersion = useRef(0);
  const personaVersion = useRef(0);
  const meetingVersion = useRef(0);
  const conversationId = useRef<string | null>(null);
  const lastRequest = useRef<{
    attendeeId: string;
    sessionId: string;
    message: string;
    history: Message[];
  } | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const selected = attendees.find((person) => person.id === attendeeId);
  const eventAttendees = attendees.filter(
    (person) => person.eventId === selected?.eventId,
  );
  const sent = active
    ? requests.find((request) => request.toAttendeeId === active.attendee.id)
    : undefined;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/status")
      .then(async (response) => {
        if (response.ok && !cancelled) setStatus(await response.json());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/meeting-requests?attendeeId=${encodeURIComponent(attendeeId)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error ?? "Could not load meeting requests.");
        if (!cancelled)
          setRequests((previous) => [
            ...previous,
            ...body.requests.filter(
              (request: MeetingRequest) =>
                !previous.some((saved) => saved.id === request.id),
            ),
          ]);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setInboxError(
            cause instanceof Error
              ? cause.message
              : "Could not load meeting requests.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [attendeeId]);

  useEffect(() => {
    transcript.current?.scrollTo({
      top: transcript.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading, error]);

  function changePersona(id: string) {
    requestVersion.current += 1;
    personaVersion.current += 1;
    meetingVersion.current += 1;
    conversationId.current = crypto.randomUUID();
    setAttendeeId(id);
    setMessages([]);
    setInput("");
    setLoading(false);
    setError("");
    setRequests([]);
    setInboxError("");
    setActive(null);
    setMeetingLoading(false);
    setMeetingNotice("");
    setVoiceMessage("");
    setVoiceLoading(false);
    lastRequest.current = null;
  }

  async function ask(message: string, retry = false) {
    if (loading || !message.trim() || !selected) return;
    // Generate in the browser action so server rendering never creates an ID.
    conversationId.current ??= crypto.randomUUID();
    const request =
      retry && lastRequest.current
        ? lastRequest.current
        : {
            attendeeId,
            sessionId: conversationId.current,
            message: message.trim(),
            history: messages
              .slice(-10)
              .map(({ role, content }) => ({
                role,
                content: content.slice(0, 1000),
              })),
          };
    const version = ++requestVersion.current;
    lastRequest.current = request;
    if (!retry)
      setMessages((previous) => [
        ...previous,
        { role: "user", content: request.message },
      ]);
    setInput("");
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ?? "Couldn't find your connections. Please try again.",
        );
      if (version === requestVersion.current) {
        const result = body as ChatResponse;
        setMessages((previous) => [
          ...previous,
          { role: "assistant", content: result.message, result },
        ]);
      }
    } catch (cause) {
      if (version === requestVersion.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Something went wrong. Please try again.",
        );
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(input);
  }

  function closeProfile() {
    meetingVersion.current += 1;
    setActive(null);
  }

  function openProfile(recommendation: Recommendation) {
    meetingVersion.current += 1;
    setMeetingLoading(false);
    setActive(recommendation);
    setMeetingMessage(
      `Hi ${recommendation.attendee.name.split(" ")[0]}, I'd love to meet at ${event.name}. ${recommendation.conversationStarter}`,
    );
    setMeetingError("");
    setMeetingNotice("");
  }

  async function requestMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || meetingLoading || sent) return;
    const version = personaVersion.current;
    const panelVersion = meetingVersion.current;
    setMeetingLoading(true);
    setMeetingError("");
    try {
      const response = await fetch("/api/meeting-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendeeId,
          recipientId: active.attendee.id,
          message: meetingMessage.trim(),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ?? "Could not save your request. Please try again.",
        );
      if (version === personaVersion.current) {
        setRequests((previous) => [
          ...previous.filter((request) => request.id !== body.request.id),
          body.request,
        ]);
        if (panelVersion === meetingVersion.current)
          setMeetingNotice(
            body.duplicate
              ? "You already have a pending demo request with this person."
              : "Meeting request saved to the demo inbox.",
          );
      }
    } catch (cause) {
      if (
        version === personaVersion.current &&
        panelVersion === meetingVersion.current
      )
        setMeetingError(
          cause instanceof Error
            ? cause.message
            : "Could not save your request.",
        );
    } finally {
      if (
        version === personaVersion.current &&
        panelVersion === meetingVersion.current
      )
        setMeetingLoading(false);
    }
  }

  async function connectVoice() {
    if (voiceLoading) return;
    const version = personaVersion.current;
    setVoiceLoading(true);
    setVoiceMessage("");
    try {
      const response = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeId }),
      });
      const body = await response.json();
      if (version === personaVersion.current)
        setVoiceMessage(
          body.error ??
            body.message ??
            "Voice session checked. Text chat is ready to use.",
        );
    } catch {
      if (version === personaVersion.current)
        setVoiceMessage(
          "Voice connection unavailable. You can keep chatting by text.",
        );
    } finally {
      if (version === personaVersion.current) setVoiceLoading(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Common Ground home">
          <span className="brand-icon" aria-hidden="true">
            ↗
          </span>
          common ground<span className="brand-dot">.</span>
        </Link>
        <div className="header-right">
          <span className="demo-badge">
            <span />
            Seeded conference demo
          </span>
          <span className="header-person">
            <span className="avatar tiny">
              {initials(selected?.name ?? "Guest")}
            </span>
            {selected?.name}
          </span>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">LESS SMALL TALK. MORE COMMON GROUND.</p>
            <h1>
              Your people
              <br />
              are <em>in this room.</em>
            </h1>
            <p className="intro-copy">
              The right conversation can change your next chapter. Tell your
              networking assistant what you’re looking for. Find the people
              worth a hello.
            </p>
            <button
              className="primary-button hero-button"
              onClick={() => setChatOpen(true)}
              disabled={!selected}
            >
              <ChatIcon />
              <span>Find my connections</span>
              <span aria-hidden="true">↗</span>
            </button>
            <div className="hero-social">
              <div className="avatar-stack">
                {attendees.slice(1, 5).map((person, index) => (
                  <span key={person.id} className={`avatar tone-${index % 4}`}>
                    {initials(person.name)}
                  </span>
                ))}
              </div>
              <p>
                <strong>{eventAttendees.length} seeded attendees</strong>
                <br />A room full of possibilities.
              </p>
            </div>
          </div>
          <div className="connection-map" aria-hidden="true">
            <div className="map-orbit orbit-one" />
            <div className="map-orbit orbit-two" />
            <div className="map-line line-one" />
            <div className="map-line line-two" />
            <div className="map-line line-three" />
            <div className="map-center">
              <span className="map-spark">✳</span>
              <span>
                A little intention.
                <br />
                <em>A better connection.</em>
              </span>
            </div>
            {attendees.slice(1, 4).map((person, index) => (
              <div className={`map-person map-person-${index}`} key={person.id}>
                <span className={`avatar tone-${index}`}>
                  {initials(person.name)}
                </span>
                <span>
                  <strong>{person.name}</strong>
                  <small>{person.position}</small>
                </span>
                <span className="map-plus">↗</span>
              </div>
            ))}
            <span className="map-caption">FIND THE OVERLAP.</span>
          </div>
        </section>
        <section className="conference-bar" aria-label="Conference details">
          <div className="conference-name">
            <span className="event-icon" aria-hidden="true">
              ◎
            </span>
            <div>
              <p className="eyebrow">YOUR CONFERENCE</p>
              <h2>{event.name}</h2>
              <p>{event.description}</p>
            </div>
          </div>
          <div className="conference-stat">
            <strong>{eventAttendees.length}</strong>
            <span>seeded profiles</span>
          </div>
          <div className="conference-stat">
            <strong>{requests.length.toString().padStart(2, "0")}</strong>
            <span>demo meeting requests</span>
          </div>
        </section>
        <section className="attendee-section">
          <div className="section-top">
            <div>
              <p className="eyebrow">THE PEOPLE BEHIND THE POSSIBILITIES</p>
              <h2>A few faces in the room.</h2>
            </div>
            <button className="text-button" onClick={() => setChatOpen(true)}>
              Find your top five <span aria-hidden="true">↗</span>
            </button>
          </div>
          <div className="attendee-grid">
            {eventAttendees
              .filter((person) => person.id !== attendeeId)
              .slice(0, 4)
              .map((person, index) => (
                <article className="attendee-card" key={person.id}>
                  <span className={`avatar large tone-${index % 4}`}>
                    {initials(person.name)}
                  </span>
                  <span className="industry">{person.industry}</span>
                  <h3>{person.name}</h3>
                  <p>
                    {person.position}
                    <br />
                    {person.company}
                  </p>
                  <div className="tags">
                    {person.canOffer.slice(0, 2).map((offer) => (
                      <span key={offer}>{offer}</span>
                    ))}
                  </div>
                </article>
              ))}
          </div>
        </section>
        {requests.length > 0 && (
          <section className="request-strip" aria-label="Your meeting requests">
            <div>
              <h2>Your demo meeting requests</h2>
              <p>
                Saved in the demo inbox. No external notifications are sent.
              </p>
            </div>
            <div className="request-pills">
              {requests.map((request) => (
                <span key={request.id}>
                  {attendees.find(
                    (person) => person.id === request.toAttendeeId,
                  )?.name ?? request.toAttendeeId}{" "}
                  <small>Pending</small>
                </span>
              ))}
            </div>
          </section>
        )}
        {inboxError && (
          <p className="inline-error" role="alert">
            {inboxError}
          </p>
        )}
      </main>
      <footer>
        <span>common ground.</span>
        <p>Fictional attendee data · Meeting requests stay in this demo.</p>
      </footer>
      <button
        className="chat-launcher"
        onClick={() => setChatOpen(true)}
        aria-label="Open networking assistant"
        aria-haspopup="dialog"
      >
        <ChatIcon />
        <span>Let’s find your people</span>
        <span aria-hidden="true">↗</span>
      </button>

      <Modal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        className="chat-dialog"
        label="Networking assistant"
      >
        <div className="chat-header">
          <div className="assistant-avatar" aria-hidden="true">
            ✳
          </div>
          <div>
            <h2>Your networking assistant</h2>
            <p>
              {status?.llm.configured
                ? "Qwen configured"
                : "Local demo matching"}{" "}
              · {eventAttendees.length} seeded attendees
            </p>
          </div>
          <button
            className="icon-button"
            onClick={() => setChatOpen(false)}
            aria-label="Close assistant"
          >
            ×
          </button>
        </div>
        <div className="persona-row">
          <label htmlFor="demo-persona">Chatting as</label>
          <select
            id="demo-persona"
            value={attendeeId}
            onChange={(event) => changePersona(event.target.value)}
          >
            {attendees.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} · {person.company}
              </option>
            ))}
          </select>
          <span className="request-count" title="Pending demo meeting requests">
            {requests.length} pending
          </span>
        </div>
        <div
          className="chat-transcript"
          ref={transcript}
          role="log"
          aria-label="Conversation"
          aria-live="polite"
          aria-busy={loading}
        >
          <div className="assistant-intro">
            <span className="intro-spark" aria-hidden="true">
              ✳
            </span>
            <h3>
              A good conversation
              <br />
              starts with a little help.
            </h3>
            <p>
              Hey {selected?.name.split(" ")[0]}! I can look through the
              attendee profiles, find your top five connections, and help you
              say hello.
            </p>
          </div>
          {messages.length === 0 && (
            <div className="suggestions">
              <button
                onClick={() => void ask(firstQuestion)}
                disabled={loading || !selected}
              >
                {firstQuestion} <span aria-hidden="true">↗</span>
              </button>
              <button
                onClick={() =>
                  void ask("Help me find people for funding and partnerships.")
                }
                disabled={loading || !selected}
              >
                I’m looking for funding and partnerships{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          )}
          {messages.map((message, index) => (
            <div key={index} className={`chat-message ${message.role}`}>
              <span className="message-label">
                {message.role === "user" ? "YOU" : "COMMON GROUND"}
              </span>
              <p className="message-content">{message.content}</p>
              {message.result && (
                <>
                  <div className="result-meta">
                    <span>
                      {message.result.mode === "qwen"
                        ? "Qwen recommendations"
                        : "Local rules · demo recommendations"}
                    </span>
                    <span>
                      {message.result.execution.provider === "daytona"
                        ? "Executed in Daytona"
                        : "Executed locally"}
                    </span>
                  </div>
                  {message.result.warning && (
                    <p className="result-warning">{message.result.warning}</p>
                  )}
                  <div className="chat-recommendations">
                    {message.result.recommendations.map((recommendation) => (
                      <button
                        className="match-card"
                        key={recommendation.attendee.id}
                        onClick={() => openProfile(recommendation)}
                        aria-label={`View ${recommendation.attendee.name} and request a meeting`}
                      >
                        <div className="match-top">
                          <span
                            className={`avatar tone-${(recommendation.rank - 1) % 4}`}
                          >
                            {initials(recommendation.attendee.name)}
                          </span>
                          <div>
                            <h3>{recommendation.attendee.name}</h3>
                            <p>
                              {recommendation.attendee.position} ·{" "}
                              {recommendation.attendee.company}
                            </p>
                          </div>
                          <span className="rank">0{recommendation.rank}</span>
                        </div>
                        <p className="match-reason">
                          {recommendation.reasons[0] ??
                            recommendation.mutualValue}
                        </p>
                        <div className="match-bottom">
                          <span>{recommendation.attendee.industry}</span>
                          <span>
                            {requests.some(
                              (request) =>
                                request.toAttendeeId ===
                                recommendation.attendee.id,
                            )
                              ? "Request pending ✓"
                              : "View connection ↗"}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                  {message.result.recommendations.length === 0 && (
                    <p className="field-hint">
                      No connections found. Try describing the skills or
                      opportunities you’re looking for.
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
          {loading && (
            <div className="thinking" role="status">
              <span className="thinking-dots" aria-hidden="true">
                •••
              </span>
              <div>
                <strong>Finding your common ground…</strong>
                <p>Looking through attendee profiles for your top five.</p>
              </div>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              <p>{error}</p>
              <button
                className="text-button"
                onClick={() =>
                  void ask(lastRequest.current?.message ?? "", true)
                }
              >
                Try again ↗
              </button>
            </div>
          )}
        </div>
        <div className="chat-composer">
          <form onSubmit={submit}>
            <label className="sr-only" htmlFor="chat-message">
              Your networking goal
            </label>
            <textarea
              id="chat-message"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Who would you like to meet?"
              rows={2}
              maxLength={500}
              disabled={loading || !selected}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  if (input.trim()) void ask(input);
                }
              }}
            />
            <button
              className="send-button"
              type="submit"
              disabled={loading || !input.trim() || !selected}
              aria-label="Send message"
            >
              ↑
            </button>
          </form>
          <div className="composer-footer">
            <span>
              Seeded profiles · {selected?.name.split(" ")[0]}’s perspective
            </span>
            <button
              className="voice-button"
              type="button"
              disabled={!status?.voice.available || voiceLoading}
              title={
                status?.voice.available
                  ? "Check realtime voice session"
                  : "Realtime voice is not connected yet"
              }
              onClick={() => void connectVoice()}
            >
              <MicIcon />
              {voiceLoading
                ? "Connecting…"
                : status?.voice.available
                  ? "Voice session"
                  : "Voice · not connected"}
            </button>
          </div>
          {voiceMessage && (
            <p className="voice-message" role="status">
              {voiceMessage}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={active !== null}
        onClose={closeProfile}
        className="profile-dialog"
        label={
          active ? `Connect with ${active.attendee.name}` : "Connection profile"
        }
      >
        {active && (
          <>
            <div className="profile-dialog-top">
              <span className="eyebrow">YOUR NEXT CONVERSATION</span>
              <button
                className="icon-button"
                onClick={closeProfile}
                aria-label="Close profile"
              >
                ×
              </button>
            </div>
            <div className="profile-person">
              <span className={`avatar large tone-${(active.rank - 1) % 4}`}>
                {initials(active.attendee.name)}
              </span>
              <div>
                <h2>{active.attendee.name}</h2>
                <p>
                  {active.attendee.position} · {active.attendee.company}
                </p>
                <span className="industry">{active.attendee.industry}</span>
              </div>
            </div>
            <p className="profile-bio">{active.attendee.bio}</p>
            <h3 className="detail-heading">Why you should connect</h3>
            <ul className="reasons">
              {active.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <div className="mutual-value">
              <strong>What you can build together</strong>
              <p>{active.mutualValue}</p>
            </div>
            <p className="tag-label">CAN OFFER</p>
            <div className="tags">
              {active.attendee.canOffer.map((offer) => (
                <span key={offer}>{offer}</span>
              ))}
            </div>
            <p className="tag-label">LOOKING FOR</p>
            <div className="tags outline">
              {active.attendee.lookingFor.map((goal) => (
                <span key={goal}>{goal}</span>
              ))}
            </div>
            <form className="meeting-form" onSubmit={requestMeeting}>
              <label htmlFor="meeting-message">Start with a hello</label>
              <textarea
                id="meeting-message"
                rows={4}
                value={meetingMessage}
                onChange={(event) => setMeetingMessage(event.target.value)}
                required
                maxLength={1000}
                disabled={meetingLoading || !!sent}
              />
              <button
                className="primary-button"
                type="submit"
                disabled={meetingLoading || !!sent || !meetingMessage.trim()}
              >
                {sent
                  ? "Meeting request pending ✓"
                  : meetingLoading
                    ? "Saving your request…"
                    : "Send request to meet"}
                <span aria-hidden="true">↗</span>
              </button>
              <p className="field-hint">
                Requests are saved to a demo inbox. No email, text, or
                notification is sent.
              </p>
            </form>
            {meetingError && (
              <div className="error" role="alert">
                {meetingError}
              </div>
            )}
            {(meetingNotice || sent) && (
              <div className="success" role="status">
                {meetingNotice ||
                  "A meeting request is already pending in the demo inbox."}
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

function Modal({
  open,
  onClose,
  className,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  className: string;
  label: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className={className}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) {
          const bounds = dialog.current.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose();
        }
      }}
    >
      {children}
    </dialog>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}
function ChatIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M20 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5A8.5 8.5 0 0 1 10.5 3h1A8.5 8.5 0 0 1 20 11.5Z" />
      <path d="M7 10h8M7 14h5" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="13" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
    </svg>
  );
}
