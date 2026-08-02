# Coach — climbing training prototype

A front-end-only, clickable prototype. No backend, no database, no build step.
All data is generated in memory at page load and thrown away on refresh.

## Run it

Open `index.html` directly, or serve the folder:

```
python -m http.server 5177
```

then visit <http://localhost:5177>. GSAP loads from a CDN, so the first
load needs a network connection; without it the app still works, it just
stops animating.

## Switching users

Bottom-left of the sidebar. Three mock people, no auth:

| | | |
|---|---|---|
| **Ross** | Coach | Roster, onboarding, per-client weekly targets, read-only view of any athlete |
| **Maks** | Client | Week 8 of 8, power-endurance phase, one session short of a 4-week streak |
| **Jade** | Client | Week 2 of 8, base phase — no power-endurance sessions scheduled yet |

## What to poke at

**Strength log** — the flow that's fully spec'd. Open it as Maks. His
three-finger drag sits at 1 of 2 clean sessions, so ticking all three
drag reps clean reveals the +2.5 kg progression live, before you save.
Tap a rep again to mark it failed and watch the reveal reverse and the
counter reset. His half-crimp is at 0 of 2, so it advances to 1 of 2 and
holds the load — both outcomes visible side by side.

Each rep cycles **clean → failed → cleared** on tap.

**Limit bouldering** — the other half of a strength session. The strength
log opens on a mode picker: **Hangboard** or **Limit Bouldering**. The
limit form is one row per problem — grade, attempts, worked or sent — with
a live tally above it. It's recruitment work with no prescribed load, so
it's kept out of the +2.5 kg progression entirely: only hangboard sessions
replay into the athlete's loads.

**Backdated logging** — every log flow opens with a date control, set to
today, clamped to the current block. Pick a past date and a banner
appears saying which day you're logging and how long ago it was. Maks's
dashboard has a missed session with a "Log it late" button.

**Weekly schedule** — drag a session to a different day, or focus one and
press ← / →. Double-click to log it. Rest-day guidance appears inline
underneath and never blocks the move: drop a second Strength session
within two days of the first, or bunch four training days together, and
it says so. Jade's default week already trips one. Guidance about days
that have already been trained through stays quiet — there's nothing left
to act on.

A day holds **two sessions at most**. Drag a third onto a full day and it
goes red and refuses. The cap governs planning only: logging what you
actually did is never blocked by it.

The `+` on a day reads the calendar. Today or earlier, it logs — the
session either happened or it didn't. A **future** day plans instead:
pick the kind of session and it lands as a suggested placeholder, to be
logged on the day itself.

**Tap any unlogged session** to open it: the day, how far off it is, what
the week still asks for, "Log it" if the day has come, and "Remove from
plan" either way. Removing arms first and confirms on a second tap, and
only ever touches the placeholder — a session with something logged
against it is deleted from its own log screen, which puts the loads back.

**Streak** — completing the current week's targets extends it. Maks is on
3; finishing week 8 lands 4, which is a milestone.

**Onboarding** — as Ross, "Onboard a client" on the Clients screen. Name,
block dates and length, starting hang loads, and the days they train.
The days you pick *are* the weekly target — one suggested slot per
prescribed session — so the plan and the target can't drift apart. The
new athlete appears in the roster and the user switcher immediately, with
empty states everywhere they have no history yet.

**Bodyweight** — clients log a reading whenever they weigh in, from the
dashboard tile or the Progress screen. One reading per day; logging the
same day again replaces it.

## The backend

Firebase project **`coach-climbing-app`**, Firestore in **europe-west2**.

`js/config.js` decides which world the app runs in. Leave `apiKey` empty
and it runs on the seeded mock data exactly as the prototype always did —
no network, nothing saved. Fill it in and the same UI runs against
Firestore. There is no third mode and no build step either way.

**Shape.** Everything hangs off one document:

```
users/{uid}                      role, name — private to that user
athletes/{id}                    members[], coachId, clientUid, inviteEmail,
                                 block, targets, template, startLoads
  …/slots/{id}                   week, type, date, sessionId
  …/sessions/{id}                date, type, mode, reps|problems|fields, notes
  …/bodyweight/{yyyy-mm-dd}      one reading per day — the date is the key
  …/maxHang/{id}  …/criticalForce/{id}
```

`members` is the only thing access control reads, so one check governs
every subcollection. **Nothing derived is stored** — prescribed loads and
clean-session streaks are replayed from the session list on the client,
so no stored number can ever disagree with the sessions behind it.

**Invites, without a Cloud Function.** A coach onboards an athlete with
their email, which lands in `inviteEmail`. When someone signs in on that
address, the rules let them add themselves to `members` — once, and
without touching anything else. The email is read off their identity
token, not from anything they typed.

**Offline** is Firestore's persistent cache doing the work. Writes queue
locally and fire their snapshot immediately, so a session logged in a
basement is on screen at once and syncs when signal returns. The rail
says "Saving…" until it has. Signing in is the one thing that needs a
connection, and the sign-in screen says so.

**Writes are optimistic twice over.** The store changes `CT.world` now,
as it always did, and hands the same change to `js/repo.js` to persist;
the snapshot listener then rebuilds `CT.world` from what is actually
stored. Ids are minted client-side so the optimistic copy and the
document that lands are one record, never two.

## Deliberately placeholder

Endurance and power-endurance sub-forms (field sets are a first guess),
the exact chart types, and the streak rules. The critical-force data
shape is invented — a critical force in kg, a % of max, a W′ reserve, and
a 24-rep decay curve.

## Layout

```
index.html
firebase.json          hosting, emulators
firestore.rules        all access control — the file worth reading
firestore.indexes.json
assets/css/app.css     tokens, then components in screen order
js/config.js           which backend, if any
js/firebase.js         the SDK, loaded from a CDN by dynamic import
js/repo.js             Firestore in, CT.world out
js/data.js             the mock world, generated relative to today's date
js/store.js            derived state, the progression rule, rest-day rules
js/ui.js               DOM helpers, icons, the GSAP motion vocabulary
js/charts.js           hand-rolled SVG charts
js/views/              signin · dashboard · schedule · progress · coach
js/logs/               strength — hangboard + limit bouldering; also owns
                       the sheet shell and the date bar ·
                       session (endurance, PE, bodyweight, type chooser,
                       plan-ahead picker) · onboard
js/app.js              shell, routing, user switching
```

Every animation degrades to an instant state change when GSAP is absent
or `prefers-reduced-motion` is set.

Installed to a home screen, the app suppresses pinch zoom, double-tap
zoom and pull-to-refresh — an over-scroll shouldn't reload the page
mid-log. Opened in a browser tab it leaves all three alone; taking them
from a page someone is merely visiting would be hostile.
