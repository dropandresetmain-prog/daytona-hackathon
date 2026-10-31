"use client";

import { useRef, useState, type FormEvent, type PointerEvent, type ReactNode } from "react";
import Link from "next/link";
import type { AttendeeProfile, RecommendationResponse } from "@/lib/types";

interface Props {
  event: { name: string; description: string };
  attendees: AttendeeProfile[];
  matcher: "daytona" | "local";
}

export function NetworkingApp({ event, attendees, matcher }: Props) {
  const inSandbox = matcher === "daytona";
  const [attendeeId, setAttendeeId] = useState(attendees[0]?.id ?? "");
  const [goal, setGoal] = useState(
    "Find funding and partnerships for a climate tech startup.",
  );
  const [limit, setLimit] = useState(3);
  const [result, setResult] = useState<RecommendationResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);
  const selected = attendees.find((attendee) => attendee.id === attendeeId);

  function clearResults() {
    requestVersion.current += 1;
    setResult(null);
    setError("");
    setLoading(false);
  }

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeId, goal, limit }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not find recommendations.");
      if (version === requestVersion.current)
        setResult(body as RecommendationResponse);
    } catch (caught) {
      if (version === requestVersion.current) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Something went wrong. Try again.",
        );
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }

  return (
    <div className="night">
      <div className="aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="shell">
        <header className="topbar">
          <Link className="brand" href="/" aria-label="Common Ground home">
            common ground
          </Link>
          <span className="pill">
            <span className="live" aria-hidden="true" />
            {inSandbox ? "Daytona sandbox" : "On this machine"}
          </span>
        </header>
        <main>
          <section className="hero">
            <h1>
              Find your next
              <br />
              common ground
            </h1>
            <p className="lede">
              {event.description} Tell us who you are and what you want from
              the room.
            </p>
            <p className="meta">
              <strong>{event.name}</strong>
              <span>
                {attendees.length} fictional profiles
                {inSandbox ? ", ranked in Daytona" : ", matched locally"}
              </span>
            </p>
          </section>

          <div className="workspace">
            <aside className="ticket">
              <form onSubmit={submit}>
                <label htmlFor="attendee">You are</label>
                <select
                  id="attendee"
                  value={attendeeId}
                  onChange={(change) => {
                    setAttendeeId(change.target.value);
                    clearResults();
                  }}
                >
                  {attendees.map((attendee) => (
                    <option key={attendee.id} value={attendee.id}>
                      {attendee.name}, {attendee.company}
                    </option>
                  ))}
                </select>
                {selected && (
                  <div className="you">
                    <span className="avatar">{initials(selected.name)}</span>
                    <div>
                      <strong>{selected.name}</strong>
                      <p>
                        {selected.position}, {selected.company}
                      </p>
                    </div>
                    <p className="bio">{selected.bio}</p>
                    <div className="chips">
                      {selected.lookingFor.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  </div>
                )}
                <label htmlFor="goal">What would make this event worthwhile?</label>
                <textarea
                  id="goal"
                  value={goal}
                  onChange={(change) => {
                    setGoal(change.target.value);
                    clearResults();
                  }}
                  rows={3}
                  required
                  maxLength={500}
                  placeholder="Meet a designer for my next product"
                  aria-describedby="goal-hint"
                />
                <p id="goal-hint" className="hint">
                  Be specific. This matches the words you write against profile
                  tags.
                </p>
                <div className="limit-row">
                  <label htmlFor="limit">People to meet</label>
                  <select
                    id="limit"
                    value={limit}
                    onChange={(change) => {
                      setLimit(Number(change.target.value));
                      clearResults();
                    }}
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="go"
                  type="submit"
                  disabled={loading || !goal.trim() || !selected}
                >
                  {loading
                    ? inSandbox
                      ? "Running in Daytona…"
                      : "Finding common ground…"
                    : "Find my connections"}
                </button>
              </form>
              <p className="fine">
                {inSandbox
                  ? "Fictional profiles. Matching runs in a Daytona sandbox. Email and phone stay on this server."
                  : "Fictional profiles. Matching stays on this machine. Nothing is saved."}
              </p>
            </aside>

            <section className="guestlist" aria-labelledby="results-title" aria-busy={loading}>
              <div className="guestlist-head">
                <h2 id="results-title">People worth a hello</h2>
                {result && (
                  <span className="pill quiet">
                    {result.recommendations.length} connections
                  </span>
                )}
              </div>
              <div role="status" aria-live="polite" className="sr-only">
                {loading
                  ? inSandbox
                    ? "Running the match in a Daytona sandbox."
                    : "Finding connections."
                  : result
                    ? `${result.recommendations.length} recommendations ready.`
                    : ""}
              </div>
              {error && (
                <div className="error" role="alert">
                  {error} Edit your goal or try again.
                </div>
              )}
              {loading && (
                <div className="waiting">
                  <h3>
                    {inSandbox ? "Running the match in Daytona" : "Looking for an overlap"}
                  </h3>
                  <p>
                    {inSandbox
                      ? "The ranker is executing on elastic compute. The first request can take a minute while the sandbox starts."
                      : "Comparing goals, offers, and interests."}
                  </p>
                </div>
              )}
              {!loading && !result && !error && (
                <div className="waiting">
                  <div className="faces" aria-hidden="true">
                    <span>AC</span>
                    <span>MT</span>
                    <span>JL</span>
                  </div>
                  <h3>Your next conversation starts here.</h3>
                  <p>Pick a profile, tell us your goal, and discover a few people to meet.</p>
                </div>
              )}
              {result && result.recommendations.length === 0 && (
                <div className="waiting">
                  <h3>No other attendees yet.</h3>
                  <p>Add more profiles to this event to find connections.</p>
                </div>
              )}
              {result && result.recommendations.length > 0 && (
                <div className="guests">
                  {result.recommendations.map((recommendation) => (
                    <Spotlight key={recommendation.attendee.id}>
                      <div className="guest-top">
                        <span className="avatar">
                          {initials(recommendation.attendee.name)}
                        </span>
                        <div>
                          <h3>{recommendation.attendee.name}</h3>
                          <p>
                            {recommendation.attendee.position},{" "}
                            {recommendation.attendee.company}
                          </p>
                        </div>
                        <span className="rank">{recommendation.rank}</span>
                      </div>
                      <p className="scoreline">
                        <span>{recommendation.attendee.industry}</span>
                        <span>
                          {recommendation.score}/100{" "}
                          <small>
                            {result.mode === "daytona" ? "sandbox score" : "local score"}
                          </small>
                        </span>
                      </p>
                      <h4>Why connect</h4>
                      <ul>
                        {recommendation.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                      <p className="mutual">{recommendation.mutualValue}</p>
                      <blockquote>{recommendation.conversationStarter}</blockquote>
                    </Spotlight>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
        <footer>
          <span>common ground</span>
          <p>Built for a useful first conversation. All profiles and results are fictional.</p>
        </footer>
      </div>
    </div>
  );
}

function Spotlight({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  function move(event: PointerEvent<HTMLElement>) {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--x", `${event.clientX - rect.left}px`);
    node.style.setProperty("--y", `${event.clientY - rect.top}px`);
  }

  return (
    <article ref={ref} className="spotlight" onPointerMove={move}>
      {children}
    </article>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}
