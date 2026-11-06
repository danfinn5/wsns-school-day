# WSNS Lunch & School Days

Subscribe in Google Calendar to see West Somerville's lunch menu, school closures,
Wednesday early releases, and noon dismissals. A separate website host is not needed.

## Subscribe

On a computer, open Google Calendar → Other calendars → **+** → **From URL**.
Paste this address and choose **Add calendar**:

https://raw.githubusercontent.com/danfinn5/wsns-school-day/main/calendar/wsns.ics

Subscribe to the URL rather than importing a downloaded file, so future updates appear.
Each family member can subscribe to the same address. Google controls when it refreshes;
last-minute changes may not appear immediately.

The feed is named **WSNS Lunch & School Days**. It contains public school information
and targets **grades K–8**.

## What appears

- Lunch choices and menu details when published by LINQ Connect.
- No-school dates from the official 2026–27 Somerville calendar.
- Wednesday dismissal at 1:00 PM, except on closures and noon-dismissal dates.
- Noon dismissals, including the days before Thanksgiving and winter recess.
- No weather or generic daily attendance events.

Lunch dates already retrieved stay in the saved calendar, including past dates.
When a refresh fails, the last saved menu stays available and is marked as saved.
Missing lunches within the next two weeks are explicitly marked unavailable or not
yet published; meals are never inferred from a repeating rotation.

## Automatic refresh

[Refresh school calendar](https://github.com/danfinn5/wsns-school-day/actions/workflows/calendar.yml)
runs every six hours, on relevant code pushes, and through **Run workflow**.
It checks calendar behavior, fetches the next six weeks of menus, and commits:

- calendar/wsns.ics — the subscription feed
- calendar/menu.json — saved public menus and refresh status

No API keys or paid host are needed. A menu-service failure produces a warning
while still publishing the schedule and saved meals. Check fetchStatus,
lastCheckedAt, and lastSuccessfulAt in the menu snapshot for source health.

To refresh or check locally with Node 20 or newer:

~~~bash
node --test test/calendar.test.js
node scripts/generate-calendar.mjs
~~~

When LINQ rejects the standard HTTP client, the generator retries in Chromium.
For that fallback, install Playwright 1.65.0 and its Chromium browser. The scheduled
workflow prepares both automatically.

## Sources and limits

- [Official school-year calendar](https://www.somerville.k12.ma.us/wp-content/uploads/2026/09/2627-Calendar-English.pdf), revised July 28, 2026.
- [WSNS school hours](https://www.somerville.k12.ma.us/schools/west-somerville-pk-8/).
- [LINQ Connect menu](https://linqconnect.com/public/menu/FE53U3?buildingId=dc643b2d-4be6-eb11-a2c9-d2abdd85801a).

The school-year dates are structured constants in src/worker.js; review them for
each new school year and calendar revision. Snow days, emergency closures, school
relocations, classroom announcements, and school-specific events are not automatically
collected. Menus are subject to change. LINQ may block automated requests; failures
are shown in refresh status and calendar descriptions.

## Existing web app

The original installable dashboard still runs with npm start on a Node host or
with Wrangler on Cloudflare Workers. It combines lunch, school hours, and weather.
Its /calendar.ics endpoint uses the same lunch-and-schedule calendar renderer,
while /api/data, /api/config, and /health remain available.

Deployment configuration is in .do/app.yaml (DigitalOcean) and wrangler.jsonc
(Cloudflare). The standalone subscription above does not depend on either host.
