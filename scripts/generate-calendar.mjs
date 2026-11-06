import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { CONFIG, buildCalendarFeed, fetchLinqMenu, normalizeLinq, addDaysISO, localISODate } from "../src/worker.js";

// The generator does not need the host's HTTP cache.
globalThis.caches = { default: { async match() { return undefined; } } };
const root = new URL("../", import.meta.url);
const snapshotURL = new URL("calendar/menu.json", root);
let previous = {};
try {
  previous = JSON.parse(await readFile(snapshotURL, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const now = new Date();
const today = localISODate(now);
const start = addDaysISO(today, -7);
const end = addDaysISO(today, 41);
let menu = { ...(previous.menu || {}) };
let fetchStatus = "ok";
let lastSuccessfulAt = previous.lastSuccessfulAt || null;
let errorMessage = null;

try {
  let fresh;
  try {
    fresh = await fetchLinqMenu(start, end);
  } catch (firstError) {
    // Some public LINQ endpoints reject Node's HTTP/TLS client.
    const run = promisify(execFile);
    const { stdout } = await run(process.env.LINQ_BROWSER_PYTHON || "python3", [
      fileURLToPath(new URL("scripts/fetch-linq.py", root)),
      CONFIG.linq.buildingId, CONFIG.linq.districtId, start, end
    ], { timeout: 90000, maxBuffer: 8 * 1024 * 1024 });
    const data = JSON.parse(stdout);
    if (!Array.isArray(data?.FamilyMenuSessions)) throw new Error("Unrecognized LINQ menu response");
    fresh = normalizeLinq(data);
  }
  for (const [date, meals] of Object.entries(fresh)) {
    menu[date] = { ...menu[date], ...meals };
  }
  lastSuccessfulAt = now.toISOString();
} catch (error) {
  fetchStatus = "unavailable";
  errorMessage = String(error.message);
  console.warn("::warning::Lunch refresh failed; preserving saved menus. " + errorMessage);
}
menu = Object.fromEntries(Object.entries(menu).filter(([date]) =>
  date >= CONFIG.schoolYear.start && date <= CONFIG.schoolYear.end));

const snapshot = {
  school: CONFIG.schoolName,
  lastCheckedAt: now.toISOString(),
  lastSuccessfulAt,
  fetchStatus,
  error: errorMessage,
  menu
};
const feed = await buildCalendarFeed(null, {
  today, now, menu,
  menuUnavailable: fetchStatus !== "ok",
  lastSuccessfulAt
});
await mkdir(new URL("calendar/", root), { recursive: true });
await writeFile(snapshotURL, JSON.stringify(snapshot, null, 2) + "\n");
await writeFile(new URL("calendar/wsns.ics", root), feed);
console.log("Calendar generated: " + (feed.match(/BEGIN:VEVENT/g) || []).length + " events; menu " + fetchStatus);
