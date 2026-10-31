import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import type { Attendee } from "@/lib/types";
import type { AttendeeRepository } from "./contracts";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ATTENDEES = 10_000;
const MAX_FIELD_LENGTH = 10_000;
const MAX_LIST_ITEMS = 100;

export class AttendeeCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttendeeCsvError";
  }
}

type Field = keyof Attendee;
const headerAliases: Record<Field, string[]> = {
  id: ["id", "attendeeid", "participantid"],
  eventId: ["eventid", "conferenceid"],
  name: ["name", "fullname", "attendeename", "participantname", "displayname"],
  email: ["email", "emailaddress"],
  phone: ["phone", "phonenumber", "mobile", "mobilenumber", "contactnumber"],
  company: ["company", "companyname", "organization", "organisation"],
  position: ["position", "jobtitle", "title", "role", "designation"],
  industry: ["industry", "sector"],
  lookingFor: [
    "lookingfor",
    "whatyourelookingfor",
    "whatyouarelookingfor",
    "goals",
    "needs",
  ],
  canOffer: ["canoffer", "whatyoucanoffer", "offers"],
  skills: ["skills", "expertise"],
  bio: ["bio", "biography", "about", "description"],
  interests: ["interests", "topics"],
  linkedinUrl: ["linkedinurl", "linkedin", "linkedinprofile"],
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseList(value: string, field: string, row: number): string[] {
  if (!value) return [];
  let items: unknown;
  if (value.startsWith("[") || value.endsWith("]")) {
    try {
      items = JSON.parse(value);
    } catch {
      throw new AttendeeCsvError(
        `CSV row ${row}: ${field} must be a JSON string array or a delimited list.`,
      );
    }
    if (
      !Array.isArray(items) ||
      items.some((item) => typeof item !== "string")
    ) {
      throw new AttendeeCsvError(
        `CSV row ${row}: ${field} must contain strings only.`,
      );
    }
  } else {
    items = value.split(/[;|,]/);
  }
  const result = (items as string[]).map((item) => item.trim()).filter(Boolean);
  if (result.length > MAX_LIST_ITEMS) {
    throw new AttendeeCsvError(
      `CSV row ${row}: ${field} exceeds ${MAX_LIST_ITEMS} items.`,
    );
  }
  return [...new Set(result)];
}

/** Parse the export as supplied; missing profile details stay empty rather than being inferred. */
export function parseAttendeesCsv(
  csv: string,
  defaultEventId = "demo-event",
): Attendee[] {
  if (!defaultEventId.trim())
    throw new AttendeeCsvError("CSV default event ID must be nonempty.");
  if (Buffer.byteLength(csv, "utf8") > MAX_FILE_BYTES) {
    throw new AttendeeCsvError("Attendee CSV exceeds the 5 MB limit.");
  }
  let records: string[][];
  try {
    records = parse(csv, {
      bom: true,
      skip_empty_lines: true,
      max_record_size: 128 * 1024,
      // Keep every value a string, particularly phone numbers and IDs.
      cast: false,
    }) as string[][];
  } catch {
    // Parser diagnostics can contain complete private records. Expose only a structural error.
    throw new AttendeeCsvError(
      "Attendee CSV is malformed: check quoting and consistent column counts.",
    );
  }
  if (records.length < 2)
    throw new AttendeeCsvError(
      "Attendee CSV must contain a header and at least one attendee.",
    );
  if (records.length - 1 > MAX_ATTENDEES) {
    throw new AttendeeCsvError(
      `Attendee CSV exceeds ${MAX_ATTENDEES} attendees.`,
    );
  }
  const headers = records[0].map(normalizeHeader);
  if (
    headers.some((header) => !header) ||
    new Set(headers).size !== headers.length
  ) {
    throw new AttendeeCsvError(
      "Attendee CSV has blank or duplicate column headers.",
    );
  }
  const columns = new Map<Field, number>();
  for (const [field, aliases] of Object.entries(headerAliases) as [
    Field,
    string[],
  ][]) {
    const matches = headers.flatMap((header, index) =>
      aliases.includes(header) ? [index] : [],
    );
    if (matches.length > 1)
      throw new AttendeeCsvError(
        `Attendee CSV has multiple columns for ${field}.`,
      );
    if (matches.length === 1) columns.set(field, matches[0]);
  }
  if (!columns.has("name"))
    throw new AttendeeCsvError(
      "Attendee CSV needs a name or full name column.",
    );
  const ids = new Set<string>();
  return records.slice(1).map((record, index) => {
    const row = index + 2;
    if (record.some((value) => value.length > MAX_FIELD_LENGTH)) {
      throw new AttendeeCsvError(
        `CSV row ${row}: a field exceeds ${MAX_FIELD_LENGTH} characters.`,
      );
    }
    const value = (field: Field) => {
      const column = columns.get(field);
      return column === undefined ? "" : record[column].trim();
    };
    const name = value("name");
    if (!name) throw new AttendeeCsvError(`CSV row ${row}: name is required.`);
    const eventId = columns.has("eventId")
      ? value("eventId")
      : defaultEventId.trim();
    if (!eventId)
      throw new AttendeeCsvError(
        `CSV row ${row}: eventId is required when its column is present.`,
      );
    // A content-derived opaque ID survives row reordering without exposing contact values.
    const id = columns.has("id")
      ? value("id")
      : `csv-${createHash("sha256")
          .update(
            JSON.stringify([
              eventId,
              name,
              value("company"),
              value("position"),
              value("email"),
              value("linkedinUrl"),
            ]),
          )
          .digest("hex")
          .slice(0, 20)}`;
    if (!id)
      throw new AttendeeCsvError(
        `CSV row ${row}: id is required when its column is present.`,
      );
    if (id.length > 100 || eventId.length > 100) {
      throw new AttendeeCsvError(
        `CSV row ${row}: id and eventId must be at most 100 characters.`,
      );
    }
    if (ids.has(id))
      throw new AttendeeCsvError(
        `CSV row ${row}: duplicate attendee ID; provide distinct explicit IDs.`,
      );
    ids.add(id);
    const linkedinUrl = value("linkedinUrl");
    if (linkedinUrl) {
      try {
        const url = new URL(linkedinUrl);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      } catch {
        throw new AttendeeCsvError(
          `CSV row ${row}: linkedinUrl must be an absolute HTTP(S) URL.`,
        );
      }
    }
    return {
      id,
      eventId,
      name,
      company: value("company"),
      position: value("position"),
      industry: value("industry"),
      lookingFor: parseList(value("lookingFor"), "lookingFor", row),
      canOffer: parseList(value("canOffer"), "canOffer", row),
      skills: parseList(value("skills"), "skills", row),
      bio: value("bio"),
      ...(value("email") ? { email: value("email") } : {}),
      ...(value("phone") ? { phone: value("phone") } : {}),
      ...(value("interests")
        ? { interests: parseList(value("interests"), "interests", row) }
        : {}),
      ...(linkedinUrl ? { linkedinUrl } : {}),
    };
  });
}

export function createCsvAttendeeRepository(
  filePath: string,
  defaultEventId = "demo-event",
): AttendeeRepository {
  let loaded: Promise<Attendee[]> | undefined;
  async function load(): Promise<Attendee[]> {
    const handle = await open(filePath, "r").catch(() => {
      throw new AttendeeCsvError(
        "Cannot open attendee CSV. Check ATTENDEES_CSV_PATH and file permissions.",
      );
    });
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
        throw new AttendeeCsvError(
          "Attendee CSV must be a regular file no larger than 5 MB.",
        );
      }
      return parseAttendeesCsv(await handle.readFile("utf8"), defaultEventId);
    } finally {
      await handle.close();
    }
  }
  function attendees(): Promise<Attendee[]> {
    loaded ??= load().catch((error: unknown) => {
      loaded = undefined;
      if (error instanceof AttendeeCsvError) throw error;
      throw new AttendeeCsvError(
        "Cannot read attendee CSV. Check the file and restart the app.",
      );
    });
    return loaded;
  }
  return {
    async getById(id) {
      return (await attendees()).find((attendee) => attendee.id === id) ?? null;
    },
    async listByEvent(eventId) {
      return (await attendees()).filter(
        (attendee) => attendee.eventId === eventId,
      );
    },
  };
}
