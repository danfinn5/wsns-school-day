import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendarFeed, schoolStatus, foldICalendarLine, normalizeLinq } from "../src/worker.js";

const options = {
  today: "2026-11-06",
  now: new Date("2026-11-06T12:00:00Z"),
  menu: {}
};
const unfold = value => value.replace(/\r\n /g, "");
const eventFor = (feed, uid) => unfold(feed).split("BEGIN:VEVENT").find(event =>
  event.includes("UID:" + uid + "@wsns-school-day\r\n"));
const bytes = value => [...value].reduce((total, char) => {
  const p = char.codePointAt(0);
  return total + (p < 128 ? 1 : p < 2048 ? 2 : p < 65536 ? 3 : 4);
}, 0);

test("closures override Wednesday dismissal, and noon dismissal overrides early release", () => {
  assert.equal(schoolStatus("2026-11-11").type, "closed");
  assert.equal(schoolStatus("2026-11-25").dismissal, "12:00 PM");
  assert.equal(schoolStatus("2026-11-18").dismissal, "1:00 PM");
});

test("feed preserves annual schedule when menus are unavailable and excludes weather", async () => {
  const feed = await buildCalendarFeed(null, { ...options, menuUnavailable: true });
  assert.ok(eventFor(feed, "closed-2026-11-11"));
  assert.ok(eventFor(feed, "noon-2026-11-25"));
  assert.ok(eventFor(feed, "early-2026-11-18"));
  assert.ok(!eventFor(feed, "early-2026-11-11"));
  assert.ok(!eventFor(feed, "early-2026-11-25"));
  assert.ok(!eventFor(feed, "schoolday-2026-11-11"));
  assert.ok(!eventFor(feed, "schoolday-2026-11-07"));
  assert.ok(eventFor(feed, "schoolday-2026-11-06").includes("temporarily unavailable"));
  assert.ok(!feed.includes("Weather:"));
  assert.ok(!feed.includes("Forecast"));
});

test("saved lunch history and stable UIDs survive later refreshes", async () => {
  const menu = {
    "2026-10-01": { lunch: { entrees: [{ name: "Pasta, tomato; sauce" }], all: [{ name: "Pasta, tomato; sauce" }] } },
    "2026-11-09": { lunch: { entrees: [{ name: "Tacos" }], all: [{ name: "Tacos" }, { name: "Rice" }] } }
  };
  const feed = await buildCalendarFeed(null, { ...options, menu, menuUnavailable: true });
  const next = await buildCalendarFeed(null, { ...options, today: "2026-12-01", menu });
  assert.ok(eventFor(feed, "schoolday-2026-10-01"));
  assert.ok(eventFor(next, "schoolday-2026-10-01"));
  assert.ok(eventFor(feed, "schoolday-2026-10-01").includes("Pasta\\, tomato\\; sauce"));
  assert.ok(eventFor(feed, "schoolday-2026-11-09").includes("Rice"));
  assert.ok(eventFor(feed, "schoolday-2026-11-09").includes("last saved menu"));
});

test("all-day events use exclusive next-day ends and unique identities", async () => {
  const feed = await buildCalendarFeed(null, options);
  const event = eventFor(feed, "closed-2026-11-11");
  assert.ok(event.includes("DTSTART;VALUE=DATE:20261111\r\n"));
  assert.ok(event.includes("DTEND;VALUE=DATE:20261112\r\n"));
  const ids = [...feed.matchAll(/^UID:(.+)$/gm)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(feed.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(feed.endsWith("END:VCALENDAR\r\n"));
});

test("long multilingual names fold at UTF-8 boundaries within 75 octets", () => {
  const original = "SUMMARY:" + "Crème brûlée 🥕 ".repeat(30);
  const folded = foldICalendarLine(original);
  assert.equal(unfold(folded), original);
  assert.ok(folded.split("\r\n").every(line => bytes(line) <= 75));
});

test("LINQ normalization separates lunch and breakfast", () => {
  const plan = name => ({ MenuPlans: [{ Days: [{
    Date: "11/09/2026", MenuMeals: [{ RecipeCategories: [{
      CategoryName: "Entree", Recipes: [{ RecipeName: name }]
    }] }]
  }] }] });
  const result = normalizeLinq({ FamilyMenuSessions: [
    { ServingSession: "Lunch", ...plan("Tacos") },
    { ServingSession: "Breakfast", ...plan("Bagel") }
  ] });
  assert.equal(result["2026-11-09"].lunch.entrees[0].name, "Tacos");
  assert.equal(result["2026-11-09"].breakfast.entrees[0].name, "Bagel");
});
