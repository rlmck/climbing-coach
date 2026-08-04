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

Against a real backend the switcher is a coach's tool only. An athlete is
only ever themselves; a coach switches between their roster and, if they
train, their own block.

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
empty states everywhere they have no history yet. Against a real backend
it also mints their six-digit code, which the sheet then shows you.

**Your own training** — coaches climb. "Set up my block" on the Clients
screen runs the same onboarding form with you as the athlete: your days,
your dates, your starting loads, devised by you rather than prescribed to
you. It's an ordinary athlete record that happens to be claimed by the
account that made it, so there's no code and nothing to hand over. It
stays out of the client roster, and the switcher labels it **You**.
Logging is disabled while you're viewing someone as their coach, so
switch to yourself to log.

**Bodyweight** — clients log a reading whenever they weigh in, from the
dashboard tile or the Progress screen. One reading per day; logging the
same day again replaces it.

**Critical force** — the one thing on an athlete's record they can't put
there themselves. See below.

## Critical force

A test is a file off a load cell, not something typed in from memory, so
it doesn't go through a log flow. The coach opens the athlete's Progress
screen and uploads it; the athlete only ever reads it. The rules say the
same thing, so an athlete who fancied flattering their own numbers has
nowhere to type them.

**The device writes one file per hand**, and puts the athlete's name and
the grip in the *filename* and nowhere else:

```
Maks_half_crimp_left_cf-test-2026-07-20T18-35-30.json
name ─┘ grip ────┘ hand ┘         when ┘
```

So everything the upload sheet shows is a guess until the coach agrees
with it. Both hands can go in at once and pair themselves on date and
grip; a single hand is still a test. A name that doesn't match the
athlete whose screen you're on is said out loud, because uploading
Jade's test onto Maks is the mistake worth catching — as is staging two
tests on one date and grip, which would land on the same record and
silently keep one. That one blocks the save until it's settled.

**Zones lead the card**, because they're the only part of a test an
athlete can act on: a band of load to pull repeaters at, per hand, on one
shared axis so the gap between hands is the first thing you see. The
numbers come second and the decay curve third — the reverse of how the
device presents it, and the right way round for whoever trains off it.

**The device's own arithmetic is never re-done.** Critical force, the
zone boundaries and the per-rep averages pass through untouched.
`js/cftest.js` adds only the bookkeeping the export leaves out: which
reps the critical force was averaged from, and whether the device
trusted them.

**That last part is the whole reason the card is shaped the way it is.**
Sampling on these tests is thin and uneven, and the device says so. A rep
it couldn't sample enough of is flagged; in Maks's real July test that's
8 of 24 reps on the right hand, and on the left it's a rep sitting
*inside* the closing three that define the critical force — so that
headline number partly rests on a rep the device itself doesn't trust.
A rep that recorded nothing at all comes through as an average of zero,
which is missing data and not a rep pulled at zero force.

None of that is smoothed away. Flagged reps get hollow markers, a rep
with nothing in it breaks the trace instead of dropping it to the floor,
the closing three are shaded where they're read, and anything worth
saying in words is said under the chart.

## The backend

Firebase project **`coach-climbing-app`**, Firestore in **europe-west2**.

`js/config.js` decides which world the app runs in. Leave `apiKey` empty
and it runs on the seeded mock data exactly as the prototype always did —
no network, nothing saved. Fill it in and the same UI runs against
Firestore. There is no third mode and no build step either way.

**Shape.** Everything hangs off one document:

```
users/{uid}                      role, name, athleteId — private to that user
invites/{123456}                 the six digits ARE the id.
                                 athleteId, coachId, claimedBy, expiresAt
athletes/{id}                    members[], coachId, clientUid, invitePin,
                                 block, targets, template, startLoads
  …/slots/{id}                   week, type, date, sessionId
  …/sessions/{id}                date, type, mode, reps|problems|fields, notes
  …/bodyweight/{yyyy-mm-dd}      one reading per day — the date is the key
  …/maxHang/{id}
  …/criticalForce/{id}           date, grip, bodyweight,
                                 hands.{left,right} — one test, both hands
```

A critical-force document carries the raw per-rep traces, which is most
of its ~40 KB against a 1 MiB limit. Kept whole rather than split off:
the trace is the only record of how a rep was actually pulled, and a test
is read as one thing.

`members` is the only thing access control reads, so one check governs
every subcollection. **Nothing derived is stored** — prescribed loads and
clean-session streaks are replayed from the session list on the client,
so no stored number can ever disagree with the sessions behind it.

### Signing in is six digits

An athlete never types an address or a password, and never sees a
confirmation email. The coach reads them a six-digit code; they type it
once; the phone remembers them from then on.

What remembers them is an **anonymous Firebase account**, minted on first
launch and living in IndexedDB. That account is the identity — the code
is only the thing that attaches it to an athlete record. Since the coach
already typed their name at onboarding, the app never has to ask.

**The claim, without a Cloud Function.** The code is a document id:
`invites/123456`. Looking one up is therefore the same act as knowing it.
Spending it stamps the holder's uid onto that invite, and *that stamp* is
the only proof the athlete record will accept. Two writes, each allowed
on its own terms, and the second is worthless without the first.

**Guessing is the exposure this design accepts**, and it is worth saying
plainly. Six digits is a million doors, of which a coach has a handful
unlocked at any time. Each closes the moment it is spent and again after
30 days, and a code that was never issued, one already spent by someone
else, and one that has lapsed are indistinguishable from outside — so a
guess that misses teaches nothing. Thin cover for a bank; ample for a
coach with a dozen athletes, and the alternative is a Cloud Function.

**Losing the phone** is the one thing that has no self-service fix, and
that's deliberate: there is no address to send a reset link to. The coach
opens **Access** on the roster and issues a new code, which puts the
record back to just them and opens it to whoever types the new one. Every
session, load and note stays exactly where it is. The replaced device
notices on next launch and says so, rather than showing an empty
dashboard that reads like a broken app.

**Invite-only.** Anonymous sign-in hands an account to every device that
opens the app. What an account can't do is *become* anything: a profile
may only be created by someone who already holds an athlete, and it is a
`client` profile, always — there is no path in the rules that mints a
coach. So "has no profile" and "has spent no code" are the same sentence,
which is exactly what lets the app show the code screen on that basis.

**Adding a coach** is therefore a deliberate act, done in the Firestore
console: create `users/{uid}` with `role: 'coach'` for an account that
already exists. Nothing in the app will do it for you, by design. Coaches
are the one account with an address on it, behind "I'm a coach" on the
sign-in screen.

**Turn on Anonymous sign-in** in the Firebase console (Authentication →
Sign-in method) or no athlete can get in — the sign-in screen says as
much rather than failing silently.

**Offline** is Firestore's persistent cache doing the work. Writes queue
locally and fire their snapshot immediately, so a session logged in a
basement is on screen at once and syncs when signal returns. The rail
says "Saving…" until it has. Entering a code is the one thing that needs
a connection, and the code screen says so.

**An athlete record is written before its plan**, never in the same
batch, and that ordering is load-bearing. Every rule guarding a slot asks
whether you're a member of the athlete above it, and a rule's `get()`
reads the database as it stood *before* the write it is judging. Batch
the two together and the slots are checked against an athlete that
doesn't exist yet: `members` is read off nothing, the expression fails,
and the whole batch comes back `permission-denied`. Same reason the
roster listener waits for the record to be acknowledged before opening
listeners on its subcollections — a listener refused that way is refused
for good, because `onSnapshot` reports the error and stops.

**Writes are optimistic twice over.** The store changes `CT.world` now,
as it always did, and hands the same change to `js/repo.js` to persist;
the snapshot listener then rebuilds `CT.world` from what is actually
stored. Ids are minted client-side so the optimistic copy and the
document that lands are one record, never two.

## Deliberately placeholder

Endurance and power-endurance sub-forms (field sets are a first guess),
the exact chart types, and the streak rules.

Critical force used to be on this list. It isn't any more: the shape is
the device's real export, and the mock world is generated as device files
and read back through the same parser an upload goes through — so the
prototype exercises the real code path, flagged reps and all.

## Layout

```
index.html
firebase.json          hosting, emulators
firestore.rules        all access control — the file worth reading
firestore.indexes.json
assets/css/app.css     tokens, then components in screen order
js/config.js           which backend, if any
js/firebase.js         the SDK, loaded from a CDN by dynamic import
js/cftest.js           the critical-force device's export, normalised.
                       Loads before data.js — the mock world is built
                       through it too
js/repo.js             Firestore in, CT.world out
js/data.js             the mock world, generated relative to today's date
js/store.js            derived state, the progression rule, rest-day rules
js/ui.js               DOM helpers, icons, the GSAP motion vocabulary
js/charts.js           hand-rolled SVG charts
js/views/              signin (the code pad, and the coach's way in) ·
                       dashboard · schedule · progress · coach ·
                       invite (a code, and how to replace it)
js/logs/               strength — hangboard + limit bouldering; also owns
                       the sheet shell and the date bar ·
                       session (endurance, PE, bodyweight, type chooser,
                       plan-ahead picker) · onboard ·
                       cfupload (device files in, confirmed by the coach)
js/app.js              shell, routing, user switching
```

Every animation degrades to an instant state change when GSAP is absent
or `prefers-reduced-motion` is set.

Installed to a home screen, the app suppresses pinch zoom, double-tap
zoom and pull-to-refresh — an over-scroll shouldn't reload the page
mid-log. Opened in a browser tab it leaves all three alone; taking them
from a page someone is merely visiting would be hostile.
