# AutoCalendar

Upload a photo or screenshot of the weekly banquets roster (up to 10 MB).
AutoCalendar reads it with Claude or OpenAI, finds the row for your name, shows
each shift with a travel event and two reminders so you can check and edit
them, then gives you calendar files (`.ics`): one per shift, or one for the
whole week.

Built for iPhone Safari first; works in any modern browser.

- [What you get](#what-you-get)
- [Run it on your computer](#run-it-on-your-computer)
- [Where the API key goes](#where-the-api-key-goes)
- [Deploy to Vercel](#deploy-to-vercel)
- [Using it on your iPhone](#using-it-on-your-iphone)
- [Settings](#settings)
- [How it reads the roster](#how-it-reads-the-roster)
- [The calendar files](#the-calendar-files)
- [Privacy and safety](#privacy-and-safety)
- [Testing](#testing)
- [Not verified yet](#not-verified-yet)

## What you get

For every shift on your row, the calendar file holds **one event** with the
travel built in:

| | |
|---|---|
| Title | **Work – Banquets (W Melbourne)** |
| Time | The shift (7:30 AM – 5:00 PM), in Melbourne time: AEDT in summer, AEST in winter, switched automatically |
| Travel | iPhone Calendar's own **Travel Time** (30 minutes), shown as a strip above the shift |
| Reminders | 30 and 15 minutes **before travel starts** (6:30 and 6:45 AM for a 7:30 AM shift): “Start getting ready for work.” and “Leave soon.” |
| Location | W Melbourne (plus the address if you set one) |
| Notes | The roster text, e.g. `Shift 0730–1700`, `Leave by 7:00 AM (30 min travel).`, and any extra words in the cell such as `Purchasing` |

Prefer travel as its own event? Settings → **Travel in the calendar** →
**Separate event** gives two events per shift: the shift, and “Travel to work
– W Melbourne” from 7:00 to 7:30 AM carrying the reminders.

Days marked `OFF`, blank cells and solid red cells get nothing. An end time
above 2400 finishes the next day (`1600 - 2700` ends at 3:00 AM). The event
codes at the top of the roster (`195P DDPCT`) are never shifts; they can be
added to the notes with a setting.

Expected result for the 19–25 Oct 2026 roster:

| Day | Shift | Travel event | Reminder 1 | Reminder 2 |
|---|---|---|---|---|
| Mon 19 Oct | 7:30 AM – 5:00 PM | 7:00 – 7:30 AM | 6:30 AM | 6:45 AM |
| Tue 20 Oct | 6:30 AM – 4:00 PM | 6:00 – 6:30 AM | 5:30 AM | 5:45 AM |
| Wed 21 Oct | 6:15 AM – 4:00 PM | 5:45 – 6:15 AM | 5:15 AM | 5:30 AM |
| Thu 22 Oct | 8:00 AM – 6:00 PM | 7:30 – 8:00 AM | 7:00 AM | 7:15 AM |
| Sat 24 Oct | 4:00 PM – 3:00 AM Sun | 3:30 – 4:00 PM | 3:00 PM | 3:15 PM |

Friday and Sunday have no shifts, so no files.

## Run it on your computer

You need Node.js 20.9 or newer.

```bash
cd AutoCalendar
npm install
cp .env.example .env.local      # then fill in the two values, see below
npm run dev
```

Open <http://localhost:3000> and sign in with your `APP_PASSWORD`.

`npm install` also installs `sharp`, which the server uses to turn photos
upright and resize them; it ships ready-made for Linux, macOS and Windows.

To try it from your iPhone on the same Wi-Fi, open
`http://<your computer's IP>:3000` in Safari (for example
`http://192.168.0.20:3000`).

For a production build on your own machine: `npm run build && npm start`.

## Where the API key goes

The site reads rosters with Anthropic's Claude API or OpenAI's API; you need a
key for at least one, and with both you can choose (and compare them) in
Settings. Keys stay on the server: only the readers in
[`src/server/readers/`](src/server/readers/) use them, and they never reach
the browser.

1. Create a key and add some credit:
   - **Claude:** [console.anthropic.com](https://console.anthropic.com) →
     **API Keys** (credit under **Billing**).
   - **OpenAI:** [platform.openai.com](https://platform.openai.com) →
     **API keys** (credit under **Billing**).
2. Put them in the environment, never in the code:
   - **On your computer:** in `.env.local` (ignored by git):

     ```bash
     ANTHROPIC_API_KEY=sk-ant-...
     OPENAI_API_KEY=sk-...
     APP_PASSWORD=a-long-password-only-you-know
     ```

   - **On Vercel:** Project → **Settings** → **Environment Variables**, the
     same names.

| Variable | Required | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | one of the two | Lets the server send roster images to Claude. |
| `OPENAI_API_KEY` | one of the two | Lets the server send roster images to OpenAI. |
| `APP_PASSWORD` | yes | The password that unlocks the site. Use a long one: anyone with it can spend your API credit. Changing it signs every device out. Without it the site stays locked. |
| `ROSTER_PROVIDER` | no | What the **Automatic** setting uses when both keys are set: `anthropic` (default) or `openai`. |
| `ROSTER_CLAUDE_MODEL` | no | Claude model. Default `claude-opus-5-5`. |
| `ROSTER_CLAUDE_EFFORT` | no | How hard Claude thinks: `low`, `medium` (default), `high`, `xhigh`, `max`. Higher is slower and costs more. |
| `ROSTER_OPENAI_MODEL` | no | OpenAI model. Default `gpt-6.1-sol`, which OpenAI describes as near its flagship at lower cost ($2 / $10 per million tokens in and out); `gpt-6-astra` is the flagship ($10 / $50). |
| `ROSTER_OPENAI_EFFORT` | no | OpenAI reasoning effort, same levels; default `medium`. |

## Deploy to Vercel

1. Push this folder to a **private** GitHub repository.
2. At [vercel.com/new](https://vercel.com/new), import the repository. Vercel
   detects Next.js; keep the defaults.
3. Before the first deploy, open **Environment Variables** and add
   `APP_PASSWORD` and `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY`.
4. Deploy. You get an address like `https://autocalendar-yourname.vercel.app`.
5. On your iPhone, open it in Safari, sign in, then **Share → Add to Home
   Screen** to open it like an app.

With the Vercel CLI instead:

```bash
npx vercel link
npx vercel env add ANTHROPIC_API_KEY production
npx vercel env add OPENAI_API_KEY production
npx vercel env add APP_PASSWORD production
npx vercel --prod
```

Notes for Vercel:

- Reading a roster usually takes 20–40 seconds. The upload route allows up to
  160 seconds (`maxDuration` in
  [`src/app/api/extract/route.ts`](src/app/api/extract/route.ts)). New
  projects run with Fluid compute, which allows this on the free Hobby plan.
  If a deploy complains about `maxDuration`, turn on Fluid compute under
  Project → Settings → Functions, or lower the value to 60.
- **Upload size.** You can pick files up to 10 MB everywhere. Vercel itself
  refuses any request over 4.5 MB (a platform limit that can't be raised), so
  on Vercel the browser shrinks bigger files before sending them; you don't
  have to do anything. Run anywhere else (your computer, your own server), the
  full 10 MB file is uploaded. Either way the server then prepares the image
  for the reader (upright, at most 2576 px and about 3.5 megapixels), which is
  as much detail as the models use.
- Changing an environment variable needs a redeploy to take effect.

## Using it on your iPhone

1. Tap **Upload roster** and pick the screenshot or photo (PNG, JPG or HEIC,
   up to 10 MB).
2. Wait for the preview. One card per shift shows the shift, the travel event
   and both reminder times. Days off show why there is no file.
3. Check anything marked in orange: the reader was unsure about it, or
   something looked odd (for example an end time before the start). Tap
   **Edit** to change times or the note, **Looks right** to dismiss, or
   **Add shift** on a day the roster got wrong.
4. Tap **Add all … shifts** for one file with the whole week, or **Download**
   on a single shift.
5. Safari shows the events: tap **Add All** and choose a calendar. If the file
   downloads instead, open it from Downloads (or the Files app), choose
   Calendar, then **Add All**.

If your name is on no row, or on more than one, the site says so and does not
guess. Names it read are listed so you can see what went wrong; fix the name in
Settings and tap **Read again**.

## Settings

Tap the gear. Settings are saved on that device in a cookie set by the server
(Safari can clear storage written by page scripts after seven days without a
visit; a server-set cookie isn't affected by that rule).

| Setting | Default |
|---|---|
| Name to match | `Meng`: matches “Meng (PT)”, “MENG (FT)”, not “Mengyu”. Type `Meng (PT)` to match the bracket too, if two people share the name. |
| Reading service | **Automatic** (Claude if its key is set, otherwise OpenAI; see `ROSTER_PROVIDER`). Choose **Claude** or **OpenAI** to use one; a service without a key on the server is greyed out. The preview says which service and model read the roster. |
| Shift title | `Work – Banquets (W Melbourne)` |
| Travel event title | `Travel to work – W Melbourne` (shown when travel is a separate event) |
| Venue | `W Melbourne` |
| Address | empty (set it to show the venue on a map) |
| Travel time | 30 minutes: − / + in 5-minute steps, quick picks (15, 20, 30, 45, 60) or type any value from 5 to 240 |
| Travel in the calendar | **In the shift event** (Apple travel time, one event per shift) or **Separate event** (a travel event before each shift) |
| Reminders | 30 and 15 minutes before travel starts, each with its own message; either can be turned off |
| Time zone | `Australia/Melbourne` |
| Function codes in notes | off |

## How it reads the roster

1. The browser converts HEIC (Safari does this itself; other browsers load a
   converter only when needed) and, on Vercel, shrinks files over 4.4 MB.
2. The server checks the file (at most 10 MB, really an image), turns it
   upright from the photo's orientation tag and scales it to at most 2576 px
   and about 3.5 megapixels (screenshots that already fit go through
   untouched).
3. It sends the image to the chosen service: Claude (`claude-opus-5-5`) or
   OpenAI (`gpt-6.1-sol`). Both get the same instructions and must answer in
   the same strict JSON format: the title, each day's date, the function
   block, every name in the name column, and the cells of rows matching your
   name, copied as written, with each cell's fill colour and a confidence.
4. Plain, tested code then makes every decision, whichever service read it: it finds exactly one row for
   your name (otherwise it stops), works out the dates and cross-checks them
   against the title and weekdays, turns each cell into shifts (`OFF`, blank,
   red, `2700`, notes) and flags anything doubtful.
5. The preview and the calendar files come from the same planning code, so what
   you see is what you get.

## The calendar files

- Times are written as Melbourne local times, e.g.
  `DTSTART;TZID=Australia/Melbourne:20261019T073000`, with a `VTIMEZONE`
  block describing AEDT and AEST and the dates the clocks change, so Calendar
  shows them in Melbourne time rather than GMT. The one exception is a time
  inside the repeated hour when daylight saving ends (2:00–3:00 AM on the
  first Sunday of April): that is written in UTC, because a local 2:30 AM
  would be ambiguous there. Change the zone in Settings → Time zone.
- Travel (the default style) is Apple's `X-APPLE-TRAVEL-DURATION:PT30M` on the
  shift event. The reminders are counted from the shift start so they still
  go off before travel: `TRIGGER;RELATED=START:-PT60M` and `-PT45M` for a
  30-minute trip. As separate events, the travel event carries `-PT30M` and
  `-PT15M`.
- Each event's ID is built from your name, the shift date and the event type,
  e.g. `meng-2026-10-19-shift@autocalendar` (and
  `meng-2026-10-19-travel@autocalendar` for a separate travel event). The same roster always gives the same
  IDs, and each export has a higher `SEQUENCE`, so an updated roster is meant
  to replace the earlier events rather than add copies (see
  [Not verified yet](#not-verified-yet)).
- File names: `shift-mon-19-oct.ics`, and `shifts-week-of-19-oct.ics` for the
  week.

## Privacy and safety

- Roster images are never saved: the server holds the image in memory for the
  one request, sends it to Anthropic or OpenAI, and drops it. Logs record only
  the service, timing and token counts. OpenAI requests are sent with
  `store: false`, so OpenAI doesn't keep them as stored responses. Each
  company still handles API data under its own retention policy.
- The preview (shift times, not the image) is kept in the browser tab's
  session storage so a reload doesn't lose your edits; it is gone when the tab
  closes.
- The API key exists only in server environment variables.
- Every page except the sign-in page, and every API route except sign-in,
  needs the sign-in cookie. Wrong passwords are refused, but attempts are not
  rate-limited, so use a long password.

## Testing

```bash
npm run check        # type check, lint and the unit/integration tests
npm run build && npm run e2e   # browser tests on iPhone 13 emulation and desktop
npm run test:live    # real images through the real APIs, once per service with a key (a few cents per image)
```

How the requested tests are covered:

| Test | Where |
|---|---|
| Your real roster against the expected table | `npm run test:live`, once your image is in `fixtures/` (below) |
| A blurry or slightly angled photo | `test:live` with `tests/live/images/synthetic-photo.jpg` |
| An overnight shift (2700) | `tests/cells.test.ts`, `tests/plan.test.ts`, and the live images |
| OFF, blank and red cells | `tests/cells.test.ts`, `tests/roster.test.ts`, and `synthetic-roster.png` / `synthetic-notes.png` live |
| A cropped image with your row missing | `tests/roster.test.ts`, and `synthetic-cropped.png` live |
| The same roster twice gives identical event IDs | `tests/plan.test.ts`, `tests/ics.test.ts`, `tests/api.test.ts`, and two live reads |
| A shift near a daylight-saving change | `tests/plan.test.ts`, `tests/time.test.ts` (4 Oct 2026 and 4 Apr 2027) |
| Your name on two rows | `tests/roster.test.ts`, and `synthetic-two-mengs.png` live |
| Claude and OpenAI requests, refusals and errors | `tests/readers.test.ts` (with stand-in API clients) |
| Uploads up to 10 MB, over 10 MB refused | `tests/api.test.ts`, `tests/normalize-image.test.ts` |

The calendar files are also parsed back with an independent iCalendar library
(`ical.js`) in `tests/ics.test.ts`.

### Testing with your roster screenshot

1. Save the screenshot as `fixtures/roster-19-oct.png` (or `.jpg`). The
   `fixtures/` folder is ignored by git.
2. Put `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` in `.env.local`.
3. Run `npm run test:live`. For each service with a key it reads the image
   twice, compares the shifts with the expected table above, checks Friday and
   Sunday give nothing and that both reads give identical event IDs. What each
   service returned is saved in `tests/live/output/` for inspection.

Or through the website: `npm run dev`, upload the screenshot, and compare the
cards with the table.

The synthetic test images are drawn by `scripts/make-test-rosters.py`
(Python with Pillow) in the same layout as the real roster.

## Not verified yet

- **Reading real images.** Neither Claude nor OpenAI has read a roster yet:
  the tests use stand-in API clients until keys are added and
  `npm run test:live` is run. The OpenAI model choice (`gpt-6.1-sol`) comes
  from OpenAI's model page, not from a measured comparison on rosters.

- **Import on a real iPhone.** The files are checked by tests and by an
  independent parser, but nobody has yet tapped them on an iPhone to confirm
  what Calendar shows. In particular, Apple travel time is an Apple-specific
  property: if iPhone drops it when importing a file, the event still has the
  right shift time and both reminders at the right times, just without the
  travel strip (use **Separate event** then). Browser tests use
  Chromium's iPhone emulation, not Safari.
- **Re-importing an updated roster.** The IDs stay the same and the sequence
  number rises, which is how calendars recognise an update. Whether iPhone
  Calendar replaces the events or adds copies when you tap Add All again has
  not been tried.
- **The Safari calendar sheet.** Downloads are served as `text/calendar`
  inline, which iPhone Safari normally opens as a list with **Add All**. If
  your iPhone saves the file instead, use the Downloads route above.

## Project layout

```text
src/app/                  pages (/, /login) and API routes
  api/extract/route.ts    image upload → Claude or OpenAI → your week
  api/ics/[file]/route.ts calendar file for the shifts in a download link
src/server/               sign-in, image preparation, reading-service choice
  readers/                Claude and OpenAI requests (same instructions, same JSON)
src/lib/                  roster rules, time zones, event planning, .ics writer (shared by browser and server)
src/components/           the iPhone-style interface
tests/                    unit and integration tests; tests/live/ calls the real API
e2e/                      Playwright browser tests
```
# AutoCarlendar
# AutoCalendar
# AutoCalendar
# AutoCalendar
