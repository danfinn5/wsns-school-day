# WSNS Lunch & School Days

A subscribable calendar for West Somerville's lunch menu, school closures, early
releases, and noon dismissals. No separate website host is required.

## Subscribe

On a computer, open Google Calendar → Other calendars → **+** → **From URL**.
Paste this address and choose **Add calendar**:

https://raw.githubusercontent.com/danfinn5/wsns-school-day/main/calendar/wsns.ics

Subscribe to the URL rather than importing a downloaded file so changes appear.
Existing subscribers keep the same URL. Google controls its own refresh timing.

## Menu source

The school is the exact menu selected by the user:

https://linqconnect.com/public/menu/FE53U3?buildingId=14d70caa-49e6-eb11-a2c9-fa7552227e36

LINQ rejects requests from GitHub's runner with HTTP 403. The collector tries LINQ
directly, then uses [School Menu Connector](https://schoolmenuconnector.com)'s
public JSON API. That service is specifically intended for automated LINQ menu
retrieval and uses a Cloudflare transport. Calendar descriptions identify meals
retrieved through it.

The fallback was verified with live meals on November 6, 2026, including chicken
or tofu on November 9 and burger choices on November 10. Its normalized response
is validated before meals are saved; empty or invalid fallback responses are not
treated as successful menu updates.

[Refresh status and saved menus](calendar/menu.json) record the selected school
IDs, retrieval time, sources, and any source error. Only public school data is stored.

## What appears

- Published lunch choices, with sides, deli, and salad options in event details.
- No-school dates from the official 2026–27 district calendar.
- Wednesday dismissal at 1:00 PM, except closures and noon dismissals.
- Noon-dismissal dates, including the days before Thanksgiving and winter recess.
- No weather events.

The feed targets grades K–8. It keeps saved lunches, including past dates, and
preserves them if both menu sources fail. Missing menus in the next two weeks are
marked unavailable or not yet published. Lunches are never inferred from a rotation.

## Refresh and checks

[Refresh school calendar](https://github.com/danfinn5/wsns-school-day/actions/workflows/calendar.yml)
runs every six hours, on relevant code pushes, and through **Run workflow**.
It tests the renderer and fallback behavior, fetches the next two weeks of menus,
then publishes calendar/wsns.ics and calendar/menu.json.

The collector scopes saved meals to the configured building and district IDs.
Changing schools does not reuse another school's saved menu.

With Node 20 or newer:

~~~bash
node --test test/calendar.test.js
node scripts/generate-calendar.mjs
~~~

No API keys or paid website host are needed. The public fallback is an external
service; if it is unavailable, saved meals and the school schedule still publish.

## School schedule

- [Official 2026–27 calendar](https://www.somerville.k12.ma.us/wp-content/uploads/2026/09/2627-Calendar-English.pdf), revised July 28, 2026.
- [School hours](https://www.somerville.k12.ma.us/schools/west-somerville-pk-8/).

Schedule dates are constants in src/worker.js and need review when the district
revises its calendar. Emergency closures, snow days, relocations, and classroom
announcements are not automatically collected. Menus are subject to change.

## Existing web app

The original dashboard can run with npm start on a Node host or with Wrangler on
Cloudflare Workers. Its /calendar.ics endpoint uses the same menu and schedule
renderer. The standalone subscription does not depend on that dashboard being hosted.

## Related implementations

[Lunchlink](https://git.sdf.org/trurl/lunchlink) documents direct JSON retrieval for
West Somerville. [School Menu Connector](https://github.com/asachs01/school_menu_connector)
documents the datacenter access issue and the Cloudflare transport used by its
public service.
