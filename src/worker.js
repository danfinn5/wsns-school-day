const CONFIG = {
  schoolName: "West Somerville Neighborhood School",
  shortName: "WSNS",
  timezone: "America/New_York",
  latitude: 42.404595,
  longitude: -71.123583,
  address: "177 Powder House Boulevard, Somerville, MA 02144",
  schoolHours: {
    regular: "8:10 AM–2:35 PM",
    wednesday: "8:10 AM–1:00 PM"
  },
  linq: {
    buildingId: "dc643b2d-4be6-eb11-a2c9-d2abdd85801a",
    districtId: "7810c14e-a7e4-eb11-a2c5-8cc0b3a2728d"
  },
  links: {
    menu: "https://linqconnect.com/public/menu/FE53U3?buildingId=dc643b2d-4be6-eb11-a2c9-d2abdd85801a",
    districtCalendar: "https://somerville.k12.ma.us/events/calendar",
    annualCalendar: "https://somerville.k12.ma.us/2026-2027-school-year-calendar-1",
    school: "https://somerville.k12.ma.us/schools/west-somerville-neighborhood-school-pk%E2%80%938"
  },
  schoolYear: {
    start: "2026-08-31",
    end: "2027-06-16"
  }
};

// Official 2026–27 SPS calendar, revised 2026-07-28.
// These are the dates that materially change whether/when a K–8 student attends.
const NO_SCHOOL = {
  "2026-08-27": "No school — Educator professional development",
  "2026-08-28": "No school — Educator professional development",
  "2026-09-04": "No school — Labor Day",
  "2026-09-07": "No school — Labor Day",
  "2026-10-12": "No school — Indigenous Peoples’ Day",
  "2026-11-03": "No school — Election Day",
  "2026-11-11": "No school — Veterans Day",
  "2026-11-26": "No school — Thanksgiving recess",
  "2026-11-27": "No school — Thanksgiving recess",
  "2026-12-24": "No school — Winter recess",
  "2026-12-25": "No school — Winter recess",
  "2026-12-28": "No school — Winter recess",
  "2026-12-29": "No school — Winter recess",
  "2026-12-30": "No school — Winter recess",
  "2026-12-31": "No school — Winter recess",
  "2027-01-01": "No school — New Year’s Day",
  "2027-01-04": "No school — Educator professional development",
  "2027-01-18": "No school — Dr. Martin Luther King Jr. Day",
  "2027-02-15": "No school — February vacation",
  "2027-02-16": "No school — February vacation",
  "2027-02-17": "No school — February vacation",
  "2027-02-18": "No school — February vacation",
  "2027-02-19": "No school — February vacation",
  "2027-03-26": "No school — Good Friday",
  "2027-04-19": "No school — Patriots’ Day / April vacation",
  "2027-04-20": "No school — April vacation",
  "2027-04-21": "No school — April vacation",
  "2027-04-22": "No school — April vacation",
  "2027-04-23": "No school — April vacation",
  "2027-05-31": "No school — Memorial Day"
};

const NOON_DISMISSAL = {
  "2026-08-31": "First day of school — noon dismissal",
  "2026-11-25": "Thanksgiving recess begins — noon dismissal",
  "2026-12-23": "Winter recess begins — noon dismissal",
  "2027-06-16": "Last day of school — noon dismissal"
};

const OBSERVANCES = {
  "2026-09-11": "Rosh Hashanah begins at sundown",
  "2026-09-20": "Yom Kippur begins at sundown",
  "2026-11-08": "Diwali",
  "2026-12-04": "Hanukkah begins at sundown",
  "2027-01-06": "Three Kings Day",
  "2027-02-06": "Lunar New Year",
  "2027-02-07": "Ramadan begins at sundown",
  "2027-03-08": "Ramadan ends",
  "2027-03-09": "Eid al-Fitr",
  "2027-03-22": "Holi",
  "2027-03-28": "Easter",
  "2027-04-21": "Passover begins",
  "2027-05-16": "Eid al-Adha"
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/data") {
      const requested = Number(url.searchParams.get("days") || 10);
      const days = Math.max(3, Math.min(requested, 21));
      return jsonResponse(await getDashboardData(days, ctx));
    }

    if (url.pathname === "/calendar.ics") {
      const ics = await buildCalendarFeed(ctx);
      return new Response(ics, {
        headers: {
          "content-type": "text/calendar; charset=utf-8",
          "content-disposition": 'inline; filename="wsns-school-day.ics"',
          "cache-control": "public, max-age=900"
        }
      });
    }

    if (url.pathname === "/api/config") {
      return jsonResponse({
        schoolName: CONFIG.schoolName,
        shortName: CONFIG.shortName,
        address: CONFIG.address,
        schoolHours: CONFIG.schoolHours,
        links: CONFIG.links
      });
    }

    if (url.pathname === "/health") {
      return jsonResponse({ ok: true, service: "wsns-school-day", now: new Date().toISOString() });
    }

    return env.ASSETS.fetch(request);
  }
};

async function getDashboardData(days, ctx) {
  const today = localISODate(new Date());
  const end = addDaysISO(today, days - 1);

  const [menuResult, weatherResult] = await Promise.allSettled([
    fetchLinqMenu(today, end, ctx),
    fetchWeather(days, ctx)
  ]);

  const menu = menuResult.status === "fulfilled" ? menuResult.value : {};
  const weather = weatherResult.status === "fulfilled" ? weatherResult.value : {};

  const rows = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysISO(today, i);
    const status = schoolStatus(date);
    rows.push({
      date,
      status,
      lunch: menu[date]?.lunch || null,
      breakfast: menu[date]?.breakfast || null,
      weather: weather[date] || null,
      pack: packSuggestion(weather[date], status)
    });
  }

  const upcoming = getUpcomingSpecialDates(today, 120);

  return {
    generatedAt: new Date().toISOString(),
    school: {
      name: CONFIG.schoolName,
      shortName: CONFIG.shortName,
      address: CONFIG.address,
      schoolHours: CONFIG.schoolHours
    },
    sources: CONFIG.links,
    days: rows,
    upcoming,
    warnings: [
      ...(menuResult.status === "rejected" ? ["Lunch menu is temporarily unavailable."] : []),
      ...(weatherResult.status === "rejected" ? ["Weather is temporarily unavailable."] : [])
    ]
  };
}

async function fetchLinqMenu(startISO, endISO, ctx) {
  const url = new URL("https://api.linqconnect.com/api/FamilyMenu");
  url.searchParams.set("buildingId", CONFIG.linq.buildingId);
  url.searchParams.set("districtId", CONFIG.linq.districtId);
  url.searchParams.set("startDate", toMDY(startISO));
  url.searchParams.set("endDate", toMDY(endISO));

  const response = await cachedFetch(url.toString(), {
    headers: {
      "accept": "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      "referer": "https://linqconnect.com/",
      "origin": "https://linqconnect.com"
    }
  }, 60 * 60 * 3, ctx);

  if (!response.ok) {
    throw new Error(`LINQ returned ${response.status}`);
  }

  const data = await response.json();
  return normalizeLinq(data);
}

function normalizeLinq(data) {
  const out = {};
  for (const session of data?.FamilyMenuSessions || []) {
    const sessionName = String(session?.ServingSession || "").toLowerCase();
    const mealKey = sessionName.includes("breakfast") ? "breakfast" :
                    sessionName.includes("lunch") ? "lunch" : null;
    if (!mealKey) continue;

    for (const plan of session?.MenuPlans || []) {
      for (const day of plan?.Days || []) {
        const date = normalizeLinqDate(day?.Date);
        if (!date) continue;

        const categories = [];
        for (const meal of day?.MenuMeals || []) {
          for (const category of meal?.RecipeCategories || []) {
            const categoryName = String(category?.CategoryName || "Other").trim();
            for (const recipe of category?.Recipes || []) {
              const name = String(recipe?.RecipeName || "").trim();
              if (!name) continue;
              categories.push({
                name,
                category: categoryName,
                allergens: recipe?.Allergens || []
              });
            }
          }
        }

        const unique = dedupeByName(categories);
        const entrees = unique.filter(x => /entrée|entree|main|protein/i.test(x.category));
        const sides = unique.filter(x => !entrees.some(e => e.name === x.name));

        out[date] ||= {};
        out[date][mealKey] = {
          entrees: (entrees.length ? entrees : unique).slice(0, 6),
          sides: sides.slice(0, 8),
          all: unique
        };
      }
    }
  }
  return out;
}

function dedupeByName(items) {
  const seen = new Set();
  return items.filter(item => {
    const k = item.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function normalizeLinqDate(value) {
  if (!value) return null;
  const s = String(value);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

async function fetchWeather(days, ctx) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", CONFIG.latitude);
  url.searchParams.set("longitude", CONFIG.longitude);
  url.searchParams.set("timezone", CONFIG.timezone);
  url.searchParams.set("forecast_days", String(Math.min(days, 16)));
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("daily", [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_probability_max",
    "precipitation_sum",
    "wind_speed_10m_max"
  ].join(","));

  const response = await cachedFetch(url.toString(), {}, 60 * 30, ctx);
  if (!response.ok) throw new Error(`Weather returned ${response.status}`);
  const data = await response.json();
  const d = data?.daily || {};
  const out = {};

  (d.time || []).forEach((date, i) => {
    out[date] = {
      code: d.weather_code?.[i],
      label: weatherLabel(d.weather_code?.[i]),
      icon: weatherIcon(d.weather_code?.[i]),
      high: round(d.temperature_2m_max?.[i]),
      low: round(d.temperature_2m_min?.[i]),
      rainChance: round(d.precipitation_probability_max?.[i]),
      precip: d.precipitation_sum?.[i],
      wind: round(d.wind_speed_10m_max?.[i])
    };
  });
  return out;
}

async function cachedFetch(url, init, ttlSeconds, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const response = await fetch(url, init);
  if (response.ok) {
    const headers = new Headers(response.headers);
    headers.set("cache-control", `public, max-age=${ttlSeconds}`);
    const cached = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
    if (ctx) ctx.waitUntil(cache.put(cacheKey, cached.clone()));
    return cached;
  }
  return response;
}

function schoolStatus(date) {
  const d = parseISODate(date);
  const day = d.getUTCDay();

  if (date < CONFIG.schoolYear.start || date > CONFIG.schoolYear.end) {
    return { type: "closed", label: "No school", detail: "Outside the 2026–27 school year", dismissal: null };
  }

  if (day === 0 || day === 6) {
    return { type: "weekend", label: "Weekend", detail: "No school", dismissal: null };
  }

  if (NO_SCHOOL[date]) {
    return { type: "closed", label: "No school", detail: NO_SCHOOL[date], dismissal: null };
  }

  if (NOON_DISMISSAL[date]) {
    return { type: "noon", label: "Noon dismissal", detail: NOON_DISMISSAL[date], dismissal: "12:00 PM" };
  }

  if (day === 3) {
    return {
      type: "early",
      label: "Early release Wednesday",
      detail: "Grades K–8 dismiss at 1:00 PM",
      dismissal: "1:00 PM"
    };
  }

  return {
    type: "regular",
    label: "Regular school day",
    detail: CONFIG.schoolHours.regular,
    dismissal: "2:35 PM"
  };
}

function getUpcomingSpecialDates(fromISO, horizonDays) {
  const events = [];
  for (let i = 0; i <= horizonDays; i++) {
    const date = addDaysISO(fromISO, i);
    const status = schoolStatus(date);
    if (status.type === "closed" && NO_SCHOOL[date]) {
      events.push({ date, type: status.type, title: NO_SCHOOL[date] });
    } else if (status.type === "noon") {
      events.push({ date, type: status.type, title: NOON_DISMISSAL[date] });
    } else if (status.type === "early") {
      events.push({ date, type: status.type, title: "Early release Wednesday — 1:00 PM dismissal" });
    }
  }
  return events.slice(0, 16);
}

function packSuggestion(weather, status) {
  if (!weather || ["closed", "weekend"].includes(status?.type)) return null;
  const bits = [];
  if ((weather.rainChance ?? 0) >= 45 || (weather.precip ?? 0) >= 0.08) bits.push("rain jacket");
  if ((weather.high ?? 70) < 45) bits.push("warm coat");
  else if ((weather.high ?? 70) < 62) bits.push("light jacket");
  if ((weather.high ?? 0) >= 82) bits.push("water bottle");
  if ((weather.wind ?? 0) >= 22) bits.push("windy");
  return bits.length ? bits.join(" · ") : "normal school-day gear";
}

async function buildCalendarFeed(ctx) {
  const today = localISODate(new Date());
  const forecastEnd = addDaysISO(today, 15);

  const [menuResult, weatherResult] = await Promise.allSettled([
    fetchLinqMenu(today, forecastEnd, ctx),
    fetchWeather(16, ctx)
  ]);

  const menu = menuResult.status === "fulfilled" ? menuResult.value : {};
  const weather = weatherResult.status === "fulfilled" ? weatherResult.value : {};

  const events = [];

  // Annual schedule events.
  for (const [date, title] of Object.entries(NO_SCHOOL)) {
    if (date >= CONFIG.schoolYear.start && date <= CONFIG.schoolYear.end) {
      events.push(icalEvent(`closed-${date}`, date, title, "Somerville Public Schools 2026–27 calendar."));
    }
  }
  for (const [date, title] of Object.entries(NOON_DISMISSAL)) {
    events.push(icalEvent(`noon-${date}`, date, title, "Grades K–8: noon dismissal."));
  }

  // All early-release Wednesdays, except closures/noon-dismissal dates.
  let d = CONFIG.schoolYear.start;
  while (d <= CONFIG.schoolYear.end) {
    const status = schoolStatus(d);
    if (status.type === "early") {
      events.push(icalEvent(
        `early-${d}`,
        d,
        "Early release — 1:00 PM",
        "West Somerville Neighborhood School grades K–8 dismiss at 1:00 PM."
      ));
    }
    d = addDaysISO(d, 1);
  }

  // Rolling near-term daily cards: lunch + weather.
  for (let i = 0; i < 16; i++) {
    const date = addDaysISO(today, i);
    const status = schoolStatus(date);
    if (!["regular", "early", "noon"].includes(status.type)) continue;

    const lunch = menu[date]?.lunch;
    const entrees = lunch?.entrees?.map(x => x.name) || [];
    const wx = weather[date];

    const titleParts = [];
    if (entrees.length) titleParts.push(`Lunch: ${entrees.slice(0, 2).join(" / ")}`);
    else titleParts.push("School day");

    if (wx) titleParts.push(`${wx.high}°/${wx.low}° ${wx.label}`);

    const desc = [
      status.label,
      status.detail,
      "",
      entrees.length ? `Lunch: ${entrees.join(", ")}` : "Lunch menu not yet published.",
      wx ? `Weather: ${wx.label}; high ${wx.high}°F, low ${wx.low}°F; rain ${wx.rainChance ?? 0}%.` : "Forecast not available.",
      "",
      "Live dashboard: open this calendar feed's host in a browser.",
      "Menu source: LINQ Connect.",
      "Schedule source: Somerville Public Schools."
    ].join("\n");

    events.push(icalEvent(`schoolday-${date}`, date, titleParts.join(" · "), desc));
  }

  const stamp = toICSDateTime(new Date());
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WSNS School Day//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:WSNS School Day",
    "X-WR-TIMEZONE:America/New_York",
    `X-WR-CALDESC:${icsEscape("West Somerville school schedule, lunch menu, and rolling weather.")}`,
    ...events.map(e => e.replace("__DTSTAMP__", stamp)),
    "END:VCALENDAR",
    ""
  ].join("\r\n");
}

function icalEvent(uid, date, summary, description) {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}@wsns-school-day`,
    "DTSTAMP:__DTSTAMP__",
    `DTSTART;VALUE=DATE:${date.replaceAll("-", "")}`,
    `DTEND;VALUE=DATE:${addDaysISO(date, 1).replaceAll("-", "")}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT"
  ].join("\r\n");
}

function weatherLabel(code) {
  const c = Number(code);
  if (c === 0) return "Clear";
  if ([1, 2].includes(c)) return "Partly cloudy";
  if (c === 3) return "Cloudy";
  if ([45, 48].includes(c)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(c)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(c)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(c)) return "Snow";
  if ([95, 96, 99].includes(c)) return "Thunderstorms";
  return "Mixed";
}

function weatherIcon(code) {
  const label = weatherLabel(code);
  return {
    "Clear": "sun",
    "Partly cloudy": "partly",
    "Cloudy": "cloud",
    "Fog": "fog",
    "Drizzle": "rain",
    "Rain": "rain",
    "Snow": "snow",
    "Thunderstorms": "storm",
    "Mixed": "cloud"
  }[label] || "cloud";
}

function localISODate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CONFIG.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${m.year}-${m.month}-${m.day}`;
}

function parseISODate(iso) {
  return new Date(`${iso}T12:00:00Z`);
}

function addDaysISO(iso, days) {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toMDY(iso) {
  const [y, m, d] = iso.split("-");
  return `${m}-${d}-${y}`;
}

function round(value) {
  return value == null ? null : Math.round(Number(value));
}

function toICSDateTime(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsEscape(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    }
  });
}
