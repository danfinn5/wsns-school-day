import { updateCalendarRevisions } from "./calendar-revisions.mjs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { CONFIG, buildCalendarFeed, getDashboardData, fetchLinqMenu, addDaysISO, localISODate } from "../src/worker.js";

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

if (previous.buildingId !== CONFIG.linq.buildingId || previous.districtId !== CONFIG.linq.districtId) previous = {};

const now = new Date();
const today = localISODate(now);
const start = today;
const end = addDaysISO(today, 13);
let menu = { ...(previous.menu || {}) };
let fetchStatus = "ok";
let lastSuccessfulAt = previous.lastSuccessfulAt || null;
let errorMessage = null;

try {
  const fresh = await fetchLinqMenu(start, end);
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
  buildingId: CONFIG.linq.buildingId,
  districtId: CONFIG.linq.districtId,
  menuURL: CONFIG.links.menu,
  menuSources: [...new Set(Object.values(menu).map(day => day.lunch?.source || "LINQ Connect"))],
  lastCheckedAt: now.toISOString(),
  lastSuccessfulAt,
  fetchStatus,
  error: errorMessage,
  menu
};
const rendered = await buildCalendarFeed(null, {
  today, now, menu,
  menuUnavailable: fetchStatus !== "ok",
  lastSuccessfulAt
});
let previousRevisions = {};
try {
  previousRevisions = JSON.parse(await readFile(new URL("calendar/revisions.json", root), "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const revised = updateCalendarRevisions(rendered, previousRevisions, now);
const dashboard = await getDashboardData(14, null, { menu, now, menuUnavailable: fetchStatus !== "ok" });
const feed = revised.calendar;
await mkdir(new URL("calendar/", root), { recursive: true });
await writeFile(snapshotURL, JSON.stringify(snapshot, null, 2) + "\n");
await writeFile(new URL("calendar/dashboard.json", root), JSON.stringify(dashboard, null, 2) + "\n");
await writeFile(new URL("calendar/wsns.ics", root), feed);
await writeFile(new URL("calendar/wsns-v2.ics", root), feed);
await writeFile(new URL("calendar/revisions.json", root), JSON.stringify(revised.revisions, null, 2) + "\n");
console.log("Calendar generated: " + (feed.match(/BEGIN:VEVENT/g) || []).length + " events; menu " + fetchStatus);
