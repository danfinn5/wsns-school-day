import { updateCalendarRevisions } from "../scripts/calendar-revisions.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendarFeed, schoolStatus, foldICalendarLine, normalizeLinq, normalizeConnectorMenu, fetchLinqMenu, CONFIG } from "../src/worker.js";

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
    "2026-11-09": { lunch: { entrees: [{ name: "Tacos" }], all: [{ name: "Tacos" }, { name: "Rice", category: "Side" }], sides: [{ name: "Rice", category: "Side" }] } }
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

test("connector menus preserve lunch choices and keep sides out of the title", () => {
  const parsed = normalizeConnectorMenu({ events: [{
    date: "2026-11-10", mealType: "Lunch",
    description: "Lunch Menu for 11/10/2026:\n\nHot Entree:\n  Side:\n    - Onion Rings\n  Hot Sandwich:\n    - Cheeseburger on a Bun\n    - Black Bean Burger on a Bun\n  Vegetable:\n    - Crispy Caesar Salad\n"
  }, {
    date: "2026-11-10", mealType: "Breakfast", description: "  Entree:\n    - Bagel\n"
  }, {
    date: "2026-12-01", mealType: "Lunch", description: "  Entree:\n    - Outside request range\n"
  }] }, "2026-11-09", "2026-11-13");
  assert.equal(Object.keys(parsed).length, 1);
  assert.equal(parsed["2026-11-10"].lunch.entrees[0].name, "Cheeseburger on a Bun");
  assert.equal(parsed["2026-11-10"].lunch.entrees.length, 2);
  assert.equal(parsed["2026-11-10"].lunch.all.length, 4);
  assert.equal(parsed["2026-11-10"].lunch.source, "School Menu Connector");
  assert.throws(() => normalizeConnectorMenu({ error: "Unavailable" }, "2026-11-09", "2026-11-13"));
});

test("blocked LINQ requests fall back using the exact selected school and date range", async () => {
  const savedFetch = globalThis.fetch;
  const savedCaches = globalThis.caches;
  const calls = [];
  globalThis.caches = { default: { async match() { return undefined; } } };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) return new Response("Forbidden", { status: 403 });
    return new Response(JSON.stringify({ events: [{
      date: "2026-11-09", mealType: "Lunch",
      description: "Lunch Menu for 11/9/2026:\n\nHot Entree:\n  Hot Entree:\n    - Sweet and Sour Chicken\n    - Sweet and Sour Tofu\n"
    }] }), { headers: { "content-type": "application/json" } });
  };
  try {
    const menu = await fetchLinqMenu("2026-11-09", "2026-11-13");
    assert.equal(calls.length, 2);
    assert.equal(new URL(calls[1].url).origin, "https://schoolmenuconnector.com");
    assert.equal(calls[1].init.method, "POST");
    const payload = JSON.parse(calls[1].init.body);
    assert.equal(payload.buildingId, "14d70caa-49e6-eb11-a2c9-fa7552227e36");
    assert.equal(payload.districtId, CONFIG.linq.districtId);
    assert.equal(payload.startDate, "11-09-2026");
    assert.equal(payload.endDate, "11-13-2026");
    assert.equal(menu["2026-11-09"].lunch.entrees.length, 2);
    const calendar = await buildCalendarFeed(null, { ...options, menu });
    assert.ok(unfold(calendar).includes("Sweet and Sour Chicken / Sweet and Sour Tofu"));
    assert.ok(!unfold(calendar).includes("Menu retrieved via"));
  } finally {
    globalThis.fetch = savedFetch;
    globalThis.caches = savedCaches;
  }
});

test("published event revisions persist and increase when unavailable menus become real meals", async () => {
  const oldFeed = await buildCalendarFeed(null, { ...options, menuUnavailable: true });
  const first = updateCalendarRevisions(oldFeed, {}, options.now);
  const uid = "schoolday-2026-11-09@wsns-school-day";
  assert.equal(first.revisions[uid].sequence, 1);
  const later = new Date("2026-11-06T18:00:00Z");
  const unchangedFeed = await buildCalendarFeed(null, { ...options, now: later, menuUnavailable: true });
  const unchanged = updateCalendarRevisions(unchangedFeed, first.revisions, later);
  assert.equal(unchanged.revisions[uid].sequence, 1);
  assert.equal(unchanged.revisions[uid].lastModified, first.revisions[uid].lastModified);
  assert.equal(unchanged.changedEvents, 0);

  const menu = { "2026-11-09": { lunch: {
    entrees: [{ name: "Sweet and Sour Chicken" }, { name: "Sweet and Sour Tofu" }],
    all: [{ name: "Sweet and Sour Chicken" }, { name: "Sweet and Sour Tofu" }]
  } } };
  const changedFeed = await buildCalendarFeed(null, { ...options, now: later, menu });
  const changed = updateCalendarRevisions(changedFeed, unchanged.revisions, later);
  assert.equal(changed.revisions[uid].sequence, 2);
  assert.equal(changed.revisions[uid].lastModified, "20261106T180000Z");
  const meal = eventFor(changed.calendar, "schoolday-2026-11-09");
  assert.ok(meal.includes("SEQUENCE:2\r\n"));
  assert.ok(meal.includes("LAST-MODIFIED:20261106T180000Z\r\n"));
  assert.ok(meal.includes("Sweet and Sour Chicken / Sweet and Sour Tofu"));
  assert.equal(changed.revisions["closed-2026-11-11@wsns-school-day"].sequence, 1);
  const ids = [...unfold(changed.calendar).matchAll(/^UID:(.+)$/gm)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
});

test("calendar bodies show readable main choices and sides, with full alternatives left on the dashboard", async () => {
  const menu = normalizeConnectorMenu({ events: [{
    date: "2026-11-09", mealType: "Lunch",
    description: "Lunch Menu for 11/9/2026:\n\nHot Entree:\n  Hot Entree:\n    - Sweet and Sour Chicken\n    - Sweet and Sour Tofu\n  Side:\n    - White Rice\n  Vegetable:\n    - Steamed Vegetable Blend\n\nDeli:\n  Deli:\n    - Sunbutter Sandwich\n\nGrab & Go Salad:\n  Side:\n    - Pita Bread\n  Protein:\n    - Assorted Salad Proteins\n\n"
  }] }, "2026-11-09", "2026-11-09");
  const lunch = menu["2026-11-09"].lunch;
  assert.equal(lunch.all.length, 7);
  assert.equal(lunch.sides.length, 2);
  const feed = await buildCalendarFeed(null, { ...options, menu, lastSuccessfulAt: "2026-11-06T12:00:00Z" });
  const meal = eventFor(feed, "schoolday-2026-11-09");
  assert.ok(meal.includes("Lunch:\\n• Sweet and Sour Chicken\\n• Sweet and Sour Tofu"));
  assert.ok(meal.includes("Sides:\\n• White Rice\\n• Steamed Vegetable Blend"));
  assert.ok(!meal.includes("Sunbutter Sandwich"));
  assert.ok(!meal.includes("Assorted Salad Proteins"));
  assert.ok(!meal.includes("Menu last retrieved"));
  assert.ok(!meal.includes("Menu retrieved via"));
  assert.ok(meal.includes("Full menu: https://danfinn5.netlify.app/wsns/"));
});
