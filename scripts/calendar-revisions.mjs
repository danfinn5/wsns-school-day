import { createHash } from "node:crypto";
import { foldICalendarLine } from "../src/worker.js";

// Imported subscribers already saw unversioned events (implicit sequence zero).
// Start revised publications at one, then persist each UID's revision history.
export function updateCalendarRevisions(calendar, previous = {}, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const revisions = { ...previous };
  let changedEvents = 0;
  const unfolded = calendar.replace(/\r?\n[ \t]/g, "");
  const revised = unfolded.replace(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/g, (_, body) => {
    const lines = body.split(/\r?\n/).filter(Boolean);
    const uidLine = lines.find(line => line.startsWith("UID:"));
    if (!uidLine) throw new Error("Calendar event is missing its UID");
    const uid = uidLine.slice(4);
    const content = lines.filter(line => !/^(DTSTAMP|SEQUENCE|LAST-MODIFIED):/.test(line));
    const hash = createHash("sha256").update(content.join("\r\n"), "utf8").digest("hex");
    const prior = previous[uid];
    let entry;
    if (prior?.hash === hash) {
      entry = prior;
    } else {
      entry = {
        hash,
        sequence: prior ? prior.sequence + 1 : 1,
        lastModified: stamp
      };
      changedEvents++;
    }
    if (!Number.isInteger(entry.sequence) || entry.sequence < 0 || entry.sequence > 2147483647) {
      throw new Error("Invalid calendar revision for " + uid);
    }
    revisions[uid] = entry;
    const metadata = [
      "SEQUENCE:" + entry.sequence,
      "LAST-MODIFIED:" + entry.lastModified,
      lines.find(line => line.startsWith("DTSTAMP:")) || "DTSTAMP:" + stamp
    ];
    return ["BEGIN:VEVENT", ...content, ...metadata, "END:VEVENT"].join("\r\n");
  });
  return {
    calendar: revised.split(/\r?\n/).map(foldICalendarLine).join("\r\n"),
    revisions,
    changedEvents
  };
}
