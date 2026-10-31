"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { AttendeeProfile, RecommendationResponse } from "@/lib/types";

interface Props {
  event: { name: string; description: string };
  attendees: AttendeeProfile[];
}

export function NetworkingApp({ event, attendees }: Props) {
  const [attendeeId, setAttendeeId] = useState(attendees[0]?.id ?? "");
  const [goal, setGoal] = useState(
    "Find funding and partnerships for a climate tech startup.",
  );
  const [limit, setLimit] = useState(3);
  const [result, setResult] = useState<RecommendationResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Ignore in-flight responses after the user changes the profile or goal.
  const requestVersion = useRef(0);
  const selected = attendees.find((attendee) => attendee.id === attendeeId);

  function clearResults() {
    requestVersion.current += 1;
    setResult(null);
    setError("");
    setLoading(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    } catch (error) {
      if (version === requestVersion.current) {
        setError(
          error instanceof Error
            ? error.message
            : "Something went wrong. Try again.",
        );
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Common Ground home">
          <span className="brand-icon" aria-hidden="true">
            ↗
          </span>{" "}
          common ground<span className="brand-dot">.</span>
        </Link>
        <span className="demo-badge">
          <span aria-hidden="true" /> Mock demo · No external calls
        </span>
      </header>
      <main>
        <section className="intro">
          <p className="eyebrow">GOOD PEOPLE. BETTER CONVERSATIONS.</p>
          <h1>
            Find your next
            <br />
            <span>common ground.</span>
          </h1>
          <p className="intro-copy">
            Skip the room full of strangers. Find people whose goals and skills
            connect with yours, and a reason to say hello.
          </p>
          <div className="event-line">
            <span className="event-icon" aria-hidden="true">
              ◎
            </span>
            <span>
              <strong>{event.name}</strong>
              <small>
                {attendees.length} fictional profiles · Local matching
              </small>
            </span>
          </div>
        </section>

        <div className="workspace">
          <aside className="profile-panel">
            <div className="section-heading">
              <span className="step">01</span>
              <h2>Start with you</h2>
            </div>
            <form onSubmit={submit}>
              <label htmlFor="attendee">Your demo profile</label>
              <select
                id="attendee"
                value={attendeeId}
                onChange={(event) => {
                  setAttendeeId(event.target.value);
                  clearResults();
                }}
              >
                {attendees.map((attendee) => (
                  <option key={attendee.id} value={attendee.id}>
                    {attendee.name} · {attendee.company}
                  </option>
                ))}
              </select>
              {selected && (
                <div className="profile-preview">
                  <div className="profile-person">
                    <span className="avatar">{initials(selected.name)}</span>
                    <div>
                      <strong>{selected.name}</strong>
                      <p>
                        {selected.position} · {selected.company}
                      </p>
                    </div>
                  </div>
                  <p className="bio">{selected.bio}</p>
                  <p className="tag-label">LOOKING FOR</p>
                  <div className="tags">
                    {selected.lookingFor.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                  <p className="tag-label">CAN OFFER</p>
                  <div className="tags offer">
                    {selected.canOffer.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                </div>
              )}
              <label htmlFor="goal">
                What would make this event worthwhile?
              </label>
              <textarea
                id="goal"
                value={goal}
                onChange={(event) => {
                  setGoal(event.target.value);
                  clearResults();
                }}
                rows={3}
                required
                maxLength={500}
                placeholder="e.g. Meet a designer for my next product"
                aria-describedby="goal-hint"
              />
              <p id="goal-hint" className="field-hint">
                Be specific. This demo matches literal keywords and profile
                tags.
              </p>
              <div className="limit-row">
                <label htmlFor="limit">People to meet</label>
                <select
                  id="limit"
                  value={limit}
                  onChange={(event) => {
                    setLimit(Number(event.target.value));
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
                className="primary-button"
                type="submit"
                disabled={loading || !goal.trim() || !selected}
              >
                {loading ? "Finding common ground…" : "Find my connections"}
                <span aria-hidden="true">↗</span>
              </button>
            </form>
            <p className="privacy-note">
              Fictional profiles. Nothing is saved or sent to an external
              service.
            </p>
          </aside>

          <section
            className="results-panel"
            aria-labelledby="results-title"
            aria-busy={loading}
          >
            <div className="results-heading">
              <div>
                <div className="section-heading">
                  <span className="step">02</span>
                  <h2 id="results-title">People worth a hello</h2>
                </div>
                <p>Why you connect, and where to begin.</p>
              </div>
              {result && (
                <span className="result-count">
                  {result.recommendations.length} connections
                </span>
              )}
            </div>
            <div role="status" aria-live="polite" className="sr-only">
              {loading
                ? "Finding connections."
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
              <div className="empty-state">
                <span className="empty-symbol pulse" aria-hidden="true">
                  ✳
                </span>
                <h3>Looking for an overlap…</h3>
                <p>Comparing goals, offers, and interests.</p>
              </div>
            )}
            {!loading && !result && !error && (
              <div className="empty-state">
                <div className="orbit" aria-hidden="true">
                  <span>AC</span>
                  <span>MT</span>
                  <span>JL</span>
                </div>
                <h3>Your next conversation starts here.</h3>
                <p>
                  Pick a profile, tell us your goal, and discover a few people
                  to meet.
                </p>
                <span className="empty-caption">
                  A LITTLE INTENTION GOES A LONG WAY
                </span>
              </div>
            )}
            {result && result.recommendations.length === 0 && (
              <div className="empty-state">
                <h3>No other attendees yet.</h3>
                <p>Add more profiles to this event to find connections.</p>
              </div>
            )}
            {result && (
              <div className="recommendations">
                {result.recommendations.map((recommendation) => (
                  <article
                    className="recommendation-card"
                    key={recommendation.attendee.id}
                  >
                    <div className="card-top">
                      <span className="avatar">
                        {initials(recommendation.attendee.name)}
                      </span>
                      <div className="person-info">
                        <h3>{recommendation.attendee.name}</h3>
                        <p>
                          {recommendation.attendee.position} ·{" "}
                          {recommendation.attendee.company}
                        </p>
                      </div>
                      <span className="rank">#{recommendation.rank}</span>
                    </div>
                    <div className="score-row">
                      <span>{recommendation.attendee.industry}</span>
                      <span>
                        {recommendation.score}/100 <small>mock relevance</small>
                      </span>
                    </div>
                    <h4>Why connect</h4>
                    <ul className="reasons">
                      {recommendation.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    <p className="mutual-value">
                      <strong>A two-way conversation</strong>
                      {recommendation.mutualValue}
                    </p>
                    <div className="icebreaker">
                      <span className="tag-label">BREAK THE ICE</span>
                      <p>“{recommendation.conversationStarter}”</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
      <footer>
        <span>common ground.</span>
        <p>
          Built for a useful first conversation. All profiles and results are
          fictional demo data.
        </p>
      </footer>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}
