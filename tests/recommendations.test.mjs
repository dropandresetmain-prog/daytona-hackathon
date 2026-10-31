import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { once } from "node:events";

let server;
let baseUrl;
let logs = "";

before(async () => {
  // Ask the OS for a free port to avoid interfering with a running demo.
  const portProbe = createServer();
  portProbe.listen(0, "127.0.0.1");
  await once(portProbe, "listening");
  const { port } = portProbe.address();
  await new Promise((resolve) => portProbe.close(resolve));
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        RECOMMENDATION_MODE: "mock",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  server.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  server.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null)
      throw new Error(`Server exited. Run npm run build first.\n${logs}`);
    try {
      if ((await fetch(baseUrl, { signal: AbortSignal.timeout(1000) })).ok)
        return;
    } catch {
      /* Wait briefly for the production server to listen. */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Server did not become ready.\n${logs}`);
});

after(async () => {
  if (server && server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
});

const post = (body) =>
  fetch(`${baseUrl}/api/recommendations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const validRequest = {
  attendeeId: "alex",
  goal: "Find funding and climate partnerships",
  limit: 3,
};

test("home page renders the fictional demo and form", async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /common ground/);
  assert.match(html, /Find my connections/);
  assert.match(html, /fictional/);
});

test("recommendations are deterministic, ranked, bounded, and explainable", async () => {
  const response = await post(validRequest);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, "mock");
  assert.equal(body.attendeeId, "alex");
  assert.equal(body.eventId, "demo-event");
  assert.equal(body.recommendations.length, 3);
  body.recommendations.forEach((item, index, items) => {
    assert.equal(item.rank, index + 1);
    assert.notEqual(item.attendee.id, "alex");
    assert.equal(item.attendee.eventId, body.eventId);
    assert.ok(item.score >= 0 && item.score <= 100);
    if (index) assert.ok(items[index - 1].score >= item.score);
    assert.ok(item.reasons.length > 0);
    assert.ok(item.mutualValue);
    assert.ok(item.conversationStarter);
    assert.equal("email" in item.attendee, false);
    assert.equal("phone" in item.attendee, false);
  });
  assert.equal(
    new Set(body.recommendations.map((item) => item.attendee.id)).size,
    3,
  );
  assert.deepEqual(await (await post(validRequest)).json(), body);
});

test("goal affects ranking and all profiles can request same-event matches", async () => {
  const funding = await (
    await post({ ...validRequest, goal: "funding", limit: 1 })
  ).json();
  const design = await (
    await post({ ...validRequest, goal: "design", limit: 1 })
  ).json();
  assert.notEqual(
    funding.recommendations[0].attendee.id,
    design.recommendations[0].attendee.id,
  );
  for (const attendeeId of ["alex", "maya", "jordan", "priya", "sam", "noor"]) {
    const response = await post({
      attendeeId,
      goal: "Meet builders",
      limit: 10,
    });
    assert.equal(response.status, 200);
    const { recommendations } = await response.json();
    assert.equal(recommendations.length, 5);
    assert.ok(
      recommendations.every(
        (item) =>
          item.attendee.id !== attendeeId &&
          item.attendee.eventId === "demo-event",
      ),
    );
  }
});

test("omitted limit defaults to three and surrounding whitespace is trimmed", async () => {
  const body = await (
    await post({ attendeeId: " alex ", goal: " funding " })
  ).json();
  assert.equal(body.attendeeId, "alex");
  assert.equal(body.goal, "funding");
  assert.equal(body.recommendations.length, 3);
});

test("invalid inputs get meaningful 400 responses", async () => {
  for (const input of [
    null,
    [],
    {},
    { ...validRequest, attendeeId: " " },
    { ...validRequest, attendeeId: "a".repeat(101) },
    { ...validRequest, goal: " " },
    { ...validRequest, goal: "a".repeat(501) },
    { ...validRequest, goal: 12 },
    ...[0, -1, 11, 1.5, "3", null].map((limit) => ({ ...validRequest, limit })),
  ]) {
    const response = await post(input);
    assert.equal(response.status, 400, JSON.stringify(input));
    assert.equal(typeof (await response.json()).error, "string");
  }
});

test("unknown attendee, malformed JSON, media type, and unsupported method are rejected", async () => {
  assert.equal(
    (await post({ ...validRequest, attendeeId: "missing" })).status,
    404,
  );
  const malformed = await fetch(`${baseUrl}/api/recommendations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, "Invalid JSON body.");
  for (const contentType of ["text/plain", "application/json-invalid"]) {
    assert.equal(
      (
        await fetch(`${baseUrl}/api/recommendations`, {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: "{}",
        })
      ).status,
      415,
    );
  }
  assert.equal((await fetch(`${baseUrl}/api/recommendations`)).status, 405);
});
