# WSNS School Day

A small installable web app for **West Somerville Neighborhood School** that combines:

- the official Somerville 2026–27 school-year schedule
- West Somerville's LINQ Connect lunch menu
- a live forecast at the school
- early-release/no-school/noon-dismissal warnings
- an automatically generated `.ics` feed for Google Calendar

The app is a **PWA**: on iPhone, open it in Safari and use **Share → Add to Home Screen**. No App Store account is needed.

## Why Cloudflare Worker?

LINQ Connect's API has bot protection that can reject ordinary server/datacenter requests. This project uses a Cloudflare Worker as the app host and menu proxy, with browser-like headers and caching.

No database is required. No API keys are required.

## Deploy

### Option A: DigitalOcean App Platform (or any Node host)

`server.js` wraps the worker in a plain Node HTTP server (no extra dependencies).

```bash
npm start
```

On DigitalOcean App Platform: create an app from this GitHub repo; the Node
buildpack auto-detects `npm start` and sets `PORT` automatically.

### Option B: Cloudflare Workers

Requirements: a free Cloudflare account and Node.js.

```bash
npm install
npx wrangler login
npm run deploy
```

Wrangler will print a URL similar to:

```text
https://wsns-school-day.YOUR-SUBDOMAIN.workers.dev
```

Open it on your phone.

## Add it to Google Calendar

After deployment, your calendar feed is:

```text
https://YOUR-WORKER-URL/calendar.ics
```

In Google Calendar on the web:

1. Open **Other calendars**
2. Click **+**
3. Choose **From URL**
4. Paste the `/calendar.ics` URL

Google Calendar will periodically refresh the subscription.

The feed contains the full-year schedule changes plus a rolling near-term school-day event with lunch and weather. The web app should be considered the live view because subscribed calendar refresh intervals are controlled by Google.

## Data sources

- Lunch: LINQ Connect `FamilyMenu` API
- Weather: Open-Meteo
- Schedule: Somerville Public Schools 2026–27 calendar, revised July 28, 2026
- School hours: WSNS K–8 8:10 AM–2:35 PM; Wednesdays 1:00 PM dismissal

## Configuration

Everything school-specific is at the top of `src/worker.js` in `CONFIG`.

The project currently targets K–8 school hours. The 2026–27 calendar dates are encoded as structured constants so they are easy to audit and update each summer.

## Useful endpoints

- `/` — app
- `/api/data?days=10` — normalized dashboard JSON
- `/calendar.ics` — Google Calendar subscription feed
- `/health` — simple health check

## Next upgrades

Good candidates:

- pull WSNS-specific live events from the SPS event calendar, not only the annual district schedule
- push/email a Sunday-night "week ahead" summary
- pollen / air-quality alert
- snow-day / emergency closure banner
- kid mode with huge lunch cards
- multiple children/schools
- configurable allergies
- daily "what to wear / pack" notification
