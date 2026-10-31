import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getChatRecommendations } from "../src/lib/chat/service";
import { mockRecommendationRanker } from "../src/lib/recommendations/mock-ranker";
import { publicProfile } from "../src/lib/attendee-profile";
import { getNetworkingEvent } from "../src/lib/event-config";
import {
  createCsvAttendeeRepository,
  parseAttendeesCsv,
} from "../src/lib/integrations/csv-repository";
import {
  getAttendeeDataSource,
  getAttendeeRepository,
} from "../src/lib/integrations/data-sources";

test("supplied SWITCH export produces five canonical matches from 39 candidates", async () => {
  const repository = createCsvAttendeeRepository(
    path.resolve("data/attendees.csv"),
  );
  const attendees = await repository.listByEvent("demo-event");
  assert.equal(attendees.length, 40);
  assert.equal(new Set(attendees.map((person) => person.id)).size, 40);
  assert.ok(
    attendees.every(
      (person) => person.skills.length && person.lookingFor.length,
    ),
  );
  assert.ok(
    attendees.every((person) => person.bio === "" && !person.canOffer.length),
  );
  const result = await getChatRecommendations(
    { attendeeId: attendees[0].id, message: "Who should I connect with?" },
    repository,
    async (context) => ({
      recommendations: await mockRecommendationRanker.rank(context),
      message: "Offline CSV recommendations.",
      mode: "mock",
      execution: { provider: "local" },
    }),
    null,
  );
  assert.equal(result.attendeeCount, 39);
  assert.equal(result.recommendations.length, 5);
  assert.equal(
    new Set(result.recommendations.map((match) => match.attendee.id)).size,
    5,
  );
  assert.ok(
    result.recommendations.every(
      (match) =>
        match.attendee.id !== attendees[0].id &&
        attendees.some((person) => person.id === match.attendee.id),
    ),
  );
});

test("CSV supports BOM, CRLF, quoted commas, embedded newlines and string phone numbers", () => {
  const csv =
    '\ufeffAttendee ID,Event ID,Full Name,Company Name,Job Title,Email Address,Phone Number,Looking For,Skills,Bio\r\na,event-a,"Sample, Person",Example,Engineer,sample@example.invalid,001234,"Funding;Partners","[""TypeScript"",""Testing""]","Line one\r\nLine two"\r\n';
  const [attendee] = parseAttendeesCsv(csv);
  assert.equal(attendee.name, "Sample, Person");
  assert.equal(attendee.phone, "001234");
  assert.deepEqual(attendee.lookingFor, ["Funding", "Partners"]);
  assert.deepEqual(attendee.skills, ["TypeScript", "Testing"]);
  assert.equal(attendee.bio, "Line one\r\nLine two");
  const profile = publicProfile(attendee);
  assert.ok(!("email" in profile) && !("phone" in profile));
});

test("missing details remain empty and generated IDs are stable across row order", () => {
  const first = parseAttendeesCsv(
    "Name,Company\nSample One,Example\nSample Two,Other\n",
    "switch-demo",
  );
  const reordered = parseAttendeesCsv(
    "Name,Company\nSample Two,Other\nSample One,Example\n",
    "switch-demo",
  );
  assert.equal(first[0].id, reordered[1].id);
  assert.equal(first[0].eventId, "switch-demo");
  assert.equal(first[0].position, "");
  assert.equal(first[0].industry, "");
  assert.equal(first[0].bio, "");
  assert.deepEqual(first[0].lookingFor, []);
  assert.deepEqual(first[0].canOffer, []);
  assert.deepEqual(first[0].skills, []);
  assert.equal(first[0].email, undefined);
});

test("CSV rejects ambiguous headers, malformed records, empty or duplicate identifiers and names", () => {
  for (const csv of [
    "Company\nExample\n",
    "Name,Full Name\nSample,Other\n",
    "Name,Name\nSample,Other\n",
    "Name,\nSample,Other\n",
    "id,Name\n,Sample\n",
    "id,Name\nsame,Sample\nsame,Other\n",
    "Name\nSample\nSample\n",
    "Name,Event ID\nSample,\n",
    'Name\n"unterminated\n',
    "Name,Company\nSample,Example,Extra\n",
    "id,Name\none,\n",
    "Name\n",
  ])
    assert.throws(() => parseAttendeesCsv(csv));
});

test("lists support delimiters and JSON while rejecting malformed JSON and unsafe URLs", () => {
  const [attendee] = parseAttendeesCsv(
    'Name,Skills,Interests\nSample,"A|B;A","C,D"\n',
  );
  assert.deepEqual(attendee.skills, ["A", "B"]);
  assert.deepEqual(attendee.interests, ["C", "D"]);
  assert.throws(
    () => parseAttendeesCsv('Name,Skills\nSample,"[1]"\n'),
    /strings only/,
  );
  assert.throws(
    () => parseAttendeesCsv('Name,Skills\nSample,"[bad]"\n'),
    /JSON string array/,
  );
  assert.throws(
    () => parseAttendeesCsv("Name,LinkedIn\nSample,javascript:alert(1)\n"),
    /absolute HTTP/,
  );
  assert.throws(
    () =>
      parseAttendeesCsv(
        `Name,Skills\nSample,${Array.from({ length: 101 }, (_, i) => `skill${i}`).join(";")}\n`,
      ),
    /exceeds 100 items/,
  );
});

test("CSV validation limits inputs without leaking private record contents", () => {
  assert.throws(
    () => parseAttendeesCsv("x".repeat(5 * 1024 * 1024 + 1)),
    /5 MB/,
  );
  assert.throws(
    () => parseAttendeesCsv(`Name\n${"x".repeat(10_001)}\n`),
    /field exceeds/,
  );
  assert.throws(
    () => parseAttendeesCsv(`Name,id\nSample,${"x".repeat(101)}\n`),
    /100 characters/,
  );
  assert.throws(
    () => parseAttendeesCsv('Name,Email\nSample,"private@example.invalid\n'),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes("private@example.invalid"));
      return true;
    },
  );
});

test("repository isolates events and fails explicitly for configured missing or invalid files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "attendee-csv-"));
  try {
    const filePath = path.join(directory, "attendees.csv");
    await writeFile(
      filePath,
      "id,eventId,name\na,one,Sample One\nb,two,Sample Two\n",
    );
    const repository = createCsvAttendeeRepository(filePath);
    assert.deepEqual(
      (await repository.listByEvent("one")).map((attendee) => attendee.id),
      ["a"],
    );
    assert.deepEqual(await repository.listByEvent("absent"), []);
    assert.equal((await repository.getById("b"))?.eventId, "two");
    assert.equal(await repository.getById("absent"), null);
    await assert.rejects(
      createCsvAttendeeRepository(
        path.join(directory, "missing.csv"),
      ).listByEvent("one"),
      /Cannot open attendee CSV/,
    );
    await writeFile(filePath, "Name\n");
    await assert.rejects(
      createCsvAttendeeRepository(filePath).listByEvent("one"),
      /at least one attendee/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("source configuration separates mock fixtures from CSV and never silently falls back", async () => {
  const names = [
    "ATTENDEE_DATA_SOURCE",
    "ATTENDEES_CSV_PATH",
    "ATTENDEES_EVENT_ID",
    "ATTENDEES_EVENT_NAME",
  ] as const;
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  try {
    process.env.ATTENDEES_CSV_PATH = path.join(
      os.tmpdir(),
      "nonexistent-networking-attendees.csv",
    );
    process.env.ATTENDEES_EVENT_ID = "switch-test";
    process.env.ATTENDEES_EVENT_NAME = "CSV demo";
    process.env.ATTENDEE_DATA_SOURCE = "mock";
    assert.equal(getAttendeeDataSource(), "mock");
    assert.equal(
      (await getAttendeeRepository().listByEvent("demo-event")).length,
      100,
    );
    assert.equal(getNetworkingEvent("mock").id, "demo-event");
    delete process.env.ATTENDEE_DATA_SOURCE;
    assert.equal(getAttendeeDataSource(), "csv");
    assert.equal(getNetworkingEvent("csv").id, "switch-test");
    assert.equal(getNetworkingEvent("csv").name, "CSV demo");
    await assert.rejects(
      getAttendeeRepository().listByEvent("switch-test"),
      /Cannot open attendee CSV/,
    );
    process.env.ATTENDEE_DATA_SOURCE = "invalid";
    assert.throws(getAttendeeDataSource, /must be mock or csv/);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
