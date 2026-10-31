"use client";

import type { Recommendation } from "@/lib/types";
import type { MeetingRequest } from "@/lib/meeting-types";

export function RecommendationCards({
  recommendations,
  requests,
  onSelect,
}: {
  recommendations: Recommendation[];
  requests: MeetingRequest[];
  onSelect: (recommendation: Recommendation) => void;
}) {
  return (
    <div className="guests">
      {recommendations.map((recommendation) => {
        const pending = requests.some(
          (request) => request.toAttendeeId === recommendation.attendee.id,
        );
        return (
          <button
            className="spotlight match-card"
            key={recommendation.attendee.id}
            onClick={() => onSelect(recommendation)}
            onPointerMove={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              event.currentTarget.style.setProperty(
                "--x",
                `${event.clientX - bounds.left}px`,
              );
              event.currentTarget.style.setProperty(
                "--y",
                `${event.clientY - bounds.top}px`,
              );
            }}
            aria-label={`View ${recommendation.attendee.name} and request a meeting`}
          >
            <div className="guest-top">
              <span className="avatar">
                {recommendation.attendee.name
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div>
                <h3>{recommendation.attendee.name}</h3>
                <p>
                  {[
                    recommendation.attendee.position,
                    recommendation.attendee.company,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Attendee"}
                </p>
              </div>
              <span className="rank">{recommendation.rank}</span>
            </div>
            <p className="scoreline">
              <span>
                {recommendation.attendee.industry || "Industry not supplied"}
              </span>
              <span>{recommendation.score}/100 relevance</span>
            </p>
            <p className="match-reason">
              {recommendation.reasons[0] ?? recommendation.mutualValue}
            </p>
            <span className="match-bottom">
              {pending ? "Request pending ✓" : "View connection & meet ↗"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
