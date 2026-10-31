"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { RecommendationCards } from "./recommendation-cards";
import { useNetworkingVoice } from "./use-networking-voice";
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
  dataSource?: "mock" | "csv";
}
const firstQuestion = "Who should I connect with at this conference?";

export function NetworkingApp({
  event,
  attendees,
  dataSource = "mock",
}: Props) {
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
  const [resetting, setResetting] = useState(false);
  const [resetNotice, setResetNotice] = useState("");
  const voiceAudio = useRef<HTMLAudioElement>(null);
  const requestVersion = useRef(0);
  const personaVersion = useRef(0);
  const meetingVersion = useRef(0);
  const conversationId = useRef<string | null>(null);
  const defaultAttendeeId =
    attendees.find((person) => person.id === "alex")?.id ??
    attendees[0]?.id ??
    "";
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

  const voice = useNetworkingVoice({
    attendeeName: selected?.name ?? "Attendee",
    audio: voiceAudio,
    onRecommend: recommendByVoice,
  });
  const latest = [...messages]
    .reverse()
    .find((message) => message.result)?.result;
  const sourceLabel =
    dataSource === "mock" ? "Fictional demo profiles" : "CSV attendee profiles";

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
    voice.stop();
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
    setMeetingError("");
    setMeetingMessage("");
    setMeetingNotice("");
    lastRequest.current = null;
  }

  async function resetDemo() {
    if (resetting) return;
    setResetting(true);
    setResetNotice("");
    voice.stop();
    requestVersion.current += 1;
    personaVersion.current += 1;
    meetingVersion.current += 1;
    conversationId.current = null;
    lastRequest.current = null;
    setChatOpen(false);
    setMessages([]);
    setInput("");
    setLoading(false);
    setError("");
    setActive(null);
    setMeetingMessage("");
    setMeetingLoading(false);
    setMeetingError("");
    setMeetingNotice("");
    setInboxError("");
    setRequests([]);
    try {
      // Clear the shared inbox before restoring the default persona so a
      // persona-change reload cannot rehydrate stale meeting requests.
      const response = await fetch("/api/meeting-requests", {
        method: "DELETE",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error ?? "Could not clear the demo inbox.");
      setAttendeeId(defaultAttendeeId);
      setResetNotice("Demo reset. Ready for a new scenario.");
    } catch (cause) {
      setAttendeeId(defaultAttendeeId);
      setResetNotice(
        cause instanceof Error
          ? cause.message
          : "Could not clear the demo inbox.",
      );
    } finally {
      setResetting(false);
    }
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
            history: messages.slice(-10).map(({ role, content }) => ({
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
        return result;
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
      `${recommendation.conversationStarter} Would you like to meet at ${event.name}?`.slice(
        0,
        1000,
      ),
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

  async function recommendByVoice(goal: string): Promise<ChatResponse> {
    const result = await ask(goal);
    if (!result)
      throw new Error("The recommendation request did not complete.");
    return result;
  }

  return (
    <div className="shell">
      <div className="aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Common Ground home">
          common ground
        </Link>
        <div className="topbar-actions">
          <span className="pill">
            <span className="live" />
            {status?.mode === "qwen" ? "Qwen · " : "Local matching · "}
            {status?.execution === "daytona" ? "Daytona" : "Demo"}
          </span>
          <button
            type="button"
            className="reset-demo"
            onClick={() => void resetDemo()}
            disabled={resetting}
            title="Clear recommendations, chat, and demo meeting requests"
          >
            {resetting ? "Resetting…" : "Reset Demo"}
          </button>
        </div>
      </header>
      {resetNotice && (
        <p className="reset-notice" role="status">
          {resetNotice}
        </p>
      )}
      <main>
        <section className="hero">
          <h1>
            Find your next
            <br />
            common ground
          </h1>
          <p className="lede">
            A room full of people. A conversation worth having. Ask your
            assistant who to connect with and why.
          </p>
          <p className="meta">
            <strong>{event.name}</strong>
            <span>
              {eventAttendees.length} attendees · {sourceLabel.toLowerCase()}
            </span>
          </p>
        </section>
        <div className="workspace">
          <aside className="ticket">
            <label htmlFor="page-persona">You are</label>
            <select
              id="page-persona"
              value={attendeeId}
              onChange={(event) => changePersona(event.target.value)}
            >
              {attendees.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                  {person.company ? ", " + person.company : ""}
                </option>
              ))}
            </select>
            {selected && (
              <div className="you">
                <span className="avatar">{initials(selected.name)}</span>
                <div>
                  <strong>{selected.name}</strong>
                  <p>
                    {[selected.position, selected.company]
                      .filter(Boolean)
                      .join(" · ") || "Conference attendee"}
                  </p>
                </div>
                <p className="bio">
                  {selected.bio || "No biography supplied."}
                </p>
                <div className="chips">
                  {selected.lookingFor.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
            )}
            <button
              className="go"
              disabled={!selected}
              onClick={() => setChatOpen(true)}
            >
              Find my connections <span aria-hidden="true">↗</span>
            </button>
            <p className="fine">
              Ask by text or voice. Recommendations use the attendee data;
              contact details stay private.
            </p>
            <p className="fine">
              {sourceLabel}. Meeting requests stay in this demo.
            </p>
          </aside>
          <section
            className="guestlist"
            aria-labelledby="results-title"
            aria-busy={loading}
          >
            <div className="guestlist-head">
              <h2 id="results-title">People worth a hello</h2>
              {latest && (
                <span className="pill quiet">
                  {latest.recommendations.length} connections
                </span>
              )}
            </div>
            {latest ? (
              <>
                <p className="results-summary">{latest.message}</p>
                <RecommendationCards
                  recommendations={latest.recommendations}
                  requests={requests}
                  onSelect={openProfile}
                />
              </>
            ) : (
              <div className="waiting">
                <div className="faces" aria-hidden="true">
                  {eventAttendees
                    .filter((person) => person.id !== attendeeId)
                    .slice(0, 3)
                    .map((person) => (
                      <span key={person.id}>{initials(person.name)}</span>
                    ))}
                </div>
                <h3>Your next conversation starts here.</h3>
                <p>
                  Open the assistant and ask, “Who should I connect with at this
                  conference?”
                </p>
                <button
                  className="text-button"
                  onClick={() => setChatOpen(true)}
                >
                  Find your top five ↗
                </button>
              </div>
            )}
            {requests.length > 0 && (
              <section
                className="request-strip"
                aria-label="Your meeting requests"
              >
                <h3>Your demo meeting requests</h3>
                <div className="request-pills">
                  {requests.map((request) => (
                    <span key={request.id}>
                      {attendees.find(
                        (person) => person.id === request.toAttendeeId,
                      )?.name ?? "Attendee"}{" "}
                      <small>Pending</small>
                    </span>
                  ))}
                </div>
                <p className="fine">
                  Saved locally. No external notifications are sent.
                </p>
              </section>
            )}
            {inboxError && (
              <p className="error" role="alert">
                {inboxError}
              </p>
            )}
          </section>
        </div>
      </main>
      <footer>
        <span>common ground</span>
        <p>{sourceLabel} · Useful introductions, one conversation at a time.</p>
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
        onClose={() => {
          voice.stop();
          setChatOpen(false);
        }}
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
              {status?.mode === "qwen"
                ? "Qwen configured"
                : "Local demo matching"}{" "}
              · {eventAttendees.length} attendees
            </p>
          </div>
          <button
            className="icon-button"
            onClick={() => {
              voice.stop();
              setChatOpen(false);
            }}
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
                  <RecommendationCards
                    recommendations={message.result.recommendations}
                    requests={requests}
                    onSelect={openProfile}
                  />
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
              {sourceLabel} · {selected?.name.split(" ")[0]}’s perspective
            </span>
            <button
              className="voice-button"
              type="button"
              disabled={!status?.voice.configured || !selected}
              onClick={() =>
                voice.state === "connected" || voice.state === "connecting"
                  ? voice.stop()
                  : void voice.start()
              }
            >
              <MicIcon />
              {voice.state === "connecting"
                ? "Cancel call"
                : voice.state === "connected"
                  ? "End voice"
                  : status?.voice.configured
                    ? "Start voice"
                    : "Voice unavailable"}
            </button>
          </div>
          {(voice.state !== "idle" || voice.error) && (
            <section
              className="voice-panel"
              aria-label="Voice call"
              aria-live="polite"
            >
              <div className="voice-top">
                <span className={voice.state === "connected" ? "live" : ""} />
                <strong>
                  {voice.state === "connecting"
                    ? "Connecting voice…"
                    : voice.state === "connected"
                      ? "Voice connected · listening"
                      : "Voice stopped"}
                </strong>
                {voice.state === "connected" && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={voice.toggleMute}
                  >
                    {voice.muted ? "Unmute microphone" : "Mute microphone"}
                  </button>
                )}
              </div>
              {voice.heard && (
                <p>
                  <strong>You:</strong> {voice.heard}
                </p>
              )}
              {voice.spoken && (
                <p>
                  <strong>Assistant:</strong> {voice.spoken}
                </p>
              )}
              {voice.error && (
                <p className="voice-error" role="alert">
                  {voice.error}
                </p>
              )}
              <p className="fine">
                Voice recommendations use the same engine. Select a card to send
                a meeting request.
              </p>
            </section>
          )}
          <audio
            ref={voiceAudio}
            controls
            hidden={voice.state !== "connected"}
            aria-label="Voice assistant playback"
          />
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
            {active.attendee.bio && (
              <p className="profile-bio">{active.attendee.bio}</p>
            )}
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
            {active.attendee.canOffer.length === 0 && (
              <p className="field-hint">No offers supplied.</p>
            )}
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
