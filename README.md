# Coach — climbing training prototype

A coach, their athletes, and the training each of them actually did.
Prototype in the sense that the chart shapes and the streak rules are a
first pass — not in the sense that the data is pretend. It runs against
Firestore, installs to a home screen, and keeps working in a basement.

**No build step**, and nothing to install to work on it. `index.html`
loads plain `<script>` tags in dependency order and every file hangs
itself off one `CT` global.

**`js/config.js` decides which world it runs in.** As committed, `apiKey`
is filled in and the app talks to the real project. Blank it and the same
UI runs on a seeded mock world — three people, no auth, generated in
memory at page load and thrown away on refresh. There is no third mode —
see [The backend](#the-backend).

Live at <https://coach-climbing-app.web.app>.

## Run it

Serve the folder:

```
python -m http.server 5177
```

then visit <http://localhost:5177>. Not `file://` — a page opened that
way can register no service worker and reach no Firestore, so what's left
of it isn't the app.

GSAP is vendored, so nothing about the animation needs a network. The
fonts come from Google's CDN and fall back to system faces without one,
and in the mock world that is the only thing a first load reaches for at
all. Against the real project the Firebase SDK is a pinned dynamic import
from gstatic.

Add `?emulate` on localhost to point it at the emulator suite in
`firebase.json` rather than the live project.

## Switching users

Bottom-left of the sidebar. Three mock people, no auth:

| | | |
|---|---|---|
| **Coach** | Coach | Roster, onboarding, per-client weekly targets, and any athlete's screens — including logging on their behalf |
| **Maks** | Client | Week 8 of 9, last power-endurance week, one session short of a 4-week streak — the rest week and the peak in front of him |
| **Jade** | Client | Week 2 of 8, base phase — no power-endurance sessions scheduled yet |

Against a real backend the switcher is a coach's tool only. An athlete is
only ever themselves. A coach gets one row for themselves and one per
athlete — their own training is what the coach view *is*, not a second
account sitting alongside it.

## What to poke at

**Strength log** — the flow that's fully spec'd. Open it as Maks. His
three-finger drag sits at 1 of 2 clean sessions, so ticking all three
drag reps clean reveals the +2.5 kg progression live, before you save.
Tap a rep again to mark it failed and watch the reveal reverse and the
counter reset. His half-crimp is at 0 of 2, so it advances to 1 of 2 and
holds the load — both outcomes visible side by side.

Each rep cycles **clean → failed → cleared** on tap.

**Nothing in it is fixed.** The load is a field, not a readout: it opens
at what's prescribed and you can move it, with the calculated figure one
tap away if you change your mind. The hang count is a stepper per grip,
so six on the drag and none on the half-crimp is a session the log will
take — a grip with no hangs against it wasn't trained, and it moves
neither that grip's load nor its clean streak. Up to ten, and the pucks
lay themselves out to suit the count: one row to five, two even rows
past that, so six is 3 and 3 and ten is 5 and 5 rather than a full row
with one wide stray underneath. What you log is what the next session is
worked out from, so going heavier or lighter carries forward rather than
being argued with.

**Working loads are a share of the max, not the max.** Onboarding asks
what the athlete can hold once — added load, 20 mm, seven seconds — and
prescribes 85% of the *total* through the fingers. 70 kg bodyweight
hanging +30 kg is 100 kg on the edge; 85% of that is 85 kg, which is
+15 kg on the harness. Bodyweight is in the sum because it is on the
edge whether or not anyone writes it down — taking 85% of the added
weight alone would prescribe something far nearer maximal than it looks.
Both the percentage and the resulting load are editable, and the form
shows the arithmetic under each one. Below bodyweight is a real answer
and prints as a minus: it means take some off with a pulley.

From there the clean-session rule owns the load. The max is kept on the
record so the screens can say what the number came from, and lands on
the max-hang chart as the first test.

**Re-basing a block already running** — "Working loads" on the Clients
screen, per athlete and for the coach themselves. Same control as
onboarding: a max, a share of it, and the load that falls out. It exists
because a max gets re-tested, because a coach may want a share other
than the default for a particular athlete, and because athletes
onboarded before the percentage existed have no max on record at all.

That last case cannot be fixed automatically, and the app deliberately
doesn't try. The old form asked for *starting hang loads* — "set these
a little under a clean max hang" — so what is stored is already a
working load, not a max. There is no arithmetic that recovers a max
from it: reading those numbers as a max and taking a share of them
prescribes a share of a share, which is how a +12.5 kg starting load
becomes a 0 kg one. The max is a fact about the athlete that isn't in
the database, so the sheet says so on the card and asks for it.

Nothing logged is touched: every session keeps the load it was really
performed at. What moves is where the replay starts. `loadsFrom` is the
new starting line, and it has to be, because `startLoads` alone could
never take: the last session's recorded weight would overwrite it on the
very next replay. Sessions before that date are history; only what
happens on or after it steers the load. The clean-session count begins
afresh, which is what a load change means.

A max that has *changed* is recorded as a test dated today. One that
hasn't is the same test being reused, and inventing a second data point
for it would be a lie about how often the athlete had been tested.

**Limit bouldering** — the other half of a strength session. The strength
log opens on a mode picker: **Hangboard** or **Limit Bouldering**. The
limit form is one row per problem — grade, attempts, worked or sent — with
a live tally above it. It's recruitment work with no prescribed load, so
it's kept out of the +2.5 kg progression entirely: only hangboard sessions
replay into the athlete's loads.

**Backdated logging** — every log flow opens with a date control, set to
today. Pick a past date and a banner appears saying which day you're
logging and how long ago it was. Maks's dashboard has a missed session
with a "Log it late" button.

**The shape of a block.** A block is built backwards from the day it is
for. The last five weeks are spoken for before anything else is decided:
four weeks of **Power Endurance**, and then a **rest week** with nothing
prescribed in it at all. Everything in front of that is **Base**. So an
athlete peaking on Monday 2 November starts anaerobic work on Monday 28
September — five weeks out — trains through to Sunday 25 October, rests
the week of the 26th, and arrives on the 2nd having been left alone for
seven days.

The rest week is prescribed by being empty. No slots are generated for
it, its weekly target is nothing, and it therefore counts as met — a
streak carries through it rather than breaking on it. The Plan screen
says so in as many words, because an empty week inside a block otherwise
looks exactly like an empty week outside one, and the difference is the
whole point. Logging still works: an athlete who goes climbing in their
rest week went climbing, and it lands on the record like anything else.

**Nothing is ever planned into it, and anything already there goes.**
Two things put sessions in a rest week: a block built before the rest
week existed has its final week laid out like every other, and pulling a
peak in turns a week that was full of work into the rest. Neither is the
coach's doing and neither is theirs to tidy up, so the suggestions are
swept — on load, and after every move of the peak. Unlogged ones only: a
session that actually happened that week happened, and the slot holding
it is the record of it.

Planning into it is refused the way a full day is refused. Tapping a
rest-week day opens a sheet saying so instead of a picker that would
turn down all four choices, and an unlogged session dragged onto one
bounces with the same explanation. This governs the planner and only the
planner — **logging is untouched**. Whatever actually happens that week
still goes on the record and lands on the calendar, which is the same
rule as everywhere else in the app: a block is a plan, not a fence.

**Peaks on** — on the Clients screen, beside the weekly targets, for
every athlete and for the coach's own record. It holds the Monday the
block is aimed at, which is the day *after* the block's last day; the
length falls out of it. Mondays only, because a block runs Monday to
Sunday and a peak mid-week would leave the phases straddling two of
them — anything else typed snaps to the nearest Monday, visibly, in the
box. Eight weeks is the shortest and twenty-six the longest.

The dashboard's week ribbon draws the rest week hollow and outlined
rather than filled, because a full bar on a week with nothing in it reads
as a week completed. It also thins its own labels: a block can now run to
twenty-six segments, and "W17" in a thirteen-pixel segment is two labels
wearing each other, so it measures them and keeps every Nth — never the
one you're standing in.

Moving it re-fits the plan the way changing a weekly target does: only
unlogged sessions from the current week onwards are moved or added, so
history stays put and a week somebody has already dragged into shape
keeps that shape. Weeks the block has grown into are laid out from the
athlete's own template — the days their coach picked, not wherever there
was room. Weeks that fall off the far end lose their suggestions and keep
their sessions. The rest week is the exception to "from here on": it is
emptied wherever it lands, past weeks included, because a plan for a week
that is now rest isn't history, it's a prescription that's been
withdrawn. Nothing logged is ever unlogged by a date moving.

**Which week is which phase is never stored.** It is derived from the
length, every time it is asked, which is what makes the end date safe to
move at all — there is no second copy of the answer to go stale against
the dates. Athletes onboarded before this carry a `block.peFromWeek`
written next to their dates; it is dropped on read, like every other
migration, and nothing reads it. One consequence worth naming: pushing a
peak back re-reads which of the *past* weeks were power endurance, so a
4×4 logged in what is now a base week stops filling that week's target.
It stays on the record, on the charts and in the history — it is the
target that moved, not the session.

**A block is a plan, not a fence.** The date control used to refuse
anything before the block opened, which made the log a record of the plan
rather than of the training. It now refuses only the future — the floor
is a year back, far enough that nobody meets it — so a session before a
block starts, in the gap after one ends, or on a holiday in the middle of
neither all go on the record. They replay into the loads, land on the
charts and show up in the history like any other. The one thing they
can't do is fill a weekly target, because those weeks have no targets,
and the date bar says so when you pick such a day.

**The phase is the same kind of plan, and it has stopped being a fence
too.** Power Endurance used to be withheld from every picker until the
block reached its power-endurance weeks — the type chooser dropped it, the
dashboard dropped its card, the rail dropped its button. An athlete who
did 4×4s in week two had done them, and the app's answer was that they
couldn't have. Now all three kinds are always on offer, out of phase
marked **"Outside the plan"** and said in a line underneath. It goes on
the record, into the history and onto the charts like any other session;
what it can't do is fill a target the week never set. Planning one ahead
in an early week works the same way — a coach putting anaerobic work in
week two is making a decision, not a mistake.

The **Plan** screen walks past both ends of the block to match, as far as
the earliest thing on record in one direction and today in the other, so
a session logged outside it is somewhere you can actually get to. Those
weeks read "Before the block" / "After the block" and drop the phase
chip, the target count and the rest-day guidance rather than inventing a
plan for a week that never had one. A block that has run out says
**"Block finished"** on the dashboard instead of showing its final week
for ever.

**Weekly schedule** — **press and hold** a session for a moment and it
comes up into the hand; drop it on another day, or above or below the
other session sharing its own. Rest-day guidance appears inline
underneath and never blocks the move: drop a second Strength session
within two days of the first, or bunch four training days together, and
it says so. It counts through the week boundary, because fingers don't
know where the grid ends: Strength on the Sunday and Strength again on
the Monday is the same twenty-four hours whether or not a week divides
them, so the pair shows on both weeks, with the day that isn't on this
grid named by its date so it can't be read as the Sunday that is. Jade's
default week already trips one. Guidance about days that have already
been trained through stays quiet — there's nothing left to act on.

The hold is the point. A tile that moved the instant a finger touched it
could not share a screen with a week that scrolls — every attempt to
scroll began by grabbing whatever session was under the thumb. Under
four hundred milliseconds the gesture belongs to the page: a flick
scrolls it, a tap opens the session. Only a press that has stopped and
waited picks anything up, and a phone that can buzz says so when it
does. The keyboard needs no such distinction — focus a session and
← / → move it a day, ↑ / ↓ move it within one.

**Two sessions on one day are in an order**, and it is the order they'll
be done in: hangboarding before a route session is not the same afternoon
as the other way round. Dragging one past the other says which, and a
line on the edge the incoming tile would take says where it will land
before you let go. A day runs down the screen on a wide one and across it
on a phone, so that line knows which of its four sides to be. Nothing
recorded before this had an order, and absent is not first — those keep
the order they were written in until something rearranges them, which
settles that day for good.

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
3; finishing week 8 lands 4, which is a milestone. The rest week asks for
nothing, so it is met by doing nothing and a streak carries straight
through it.

**Onboarding** — as Ross, "Onboard a client" on the Clients screen. Name,
bodyweight, block start and length, max hang per grip, the share of it
they'll train at, and the days they train. Eight, ten or twelve weeks —
four is gone, because five weeks of any block are already spoken for (see
**The shape of a block** above) and a shorter one is a taper with nothing
behind it. The date it peaks on is worked out and shown as you pick, and
can be changed afterwards.
The days you pick *are* the weekly target — one suggested slot per
prescribed session — so the plan and the target can't drift apart. The
new athlete appears in the roster and the user switcher immediately, with
empty states everywhere they have no history yet. Against a real backend
it also mints their six-digit code, which the sheet then shows you.

**Your own training** — coaches climb. "Set up my block" on the Clients
screen runs the same onboarding form with you as the athlete: your days,
your dates, your starting loads, devised by you rather than prescribed to
you. It's an ordinary athlete record that happens to be claimed by the
account that made it, so there's no code and nothing to hand over.

It is not a second user. Your Dashboard, Plan and Progress screens *are*
that record — you log against them, you upload your own critical-force
tests there, and the switcher has one row for you, not two. Opening
somebody you coach swaps the record underneath those screens and raises
the coach-view bar to say so; the topbar carries a **You / …** control
to get back.

**Logging for somebody you coach.** The bar used to say logging was
disabled there, and it was. That made the app worse at the thing it is
for: sessions happen in front of a coach — a hangboard session they
counted the reps of, a 4×4 they timed — and the athlete who did it is on
the wall, not on their phone. So a coach logs on any record they hold,
their own included. Nothing about reach changed, because nothing needed
to: a coach has always been in `members`, which is the only check the
sessions collection makes. An athlete is still only ever themselves.

What that costs is one thing, and it is paid in wording. A log sheet
opened on somebody else says whose it is in the eyebrow — editing
included, since an edit sheet arrives pre-filled and looking right — the
quick-log heading in the rail carries their name, and every toast says
*Maks's week* rather than *your week*, because two identical sheets that
file to different people is exactly how a session ends up on the wrong
athlete. Attribution is asked of the record the sheet was handed, not of
whatever the navigation last selected; the two are usually the same and
the Clients screen is where they aren't.

The one place a log isn't offered is that screen. The roster shows every
athlete and singles out none of them, so the record `activeClient`
happens to be holding there has never been said out loud — a `+` on it
would file against somebody the coach can't see. Everywhere else the
record is named on screen, and the button is honest.

**Your name** — the coach's profile is created by hand in the Firestore
console, which is how a display name ends up being an email local part
standing in for a person. "Your name" on the Clients screen changes it,
writing `users/{uid}` under the rule that already lets a profile edit
itself. Your clients are untouched: their records carry their own names
and none of them is copied from here. Your *own* athlete record is
patched with it, because it holds a second copy of your name — the
roster, the switcher and every avatar beside your own block read it from
there, and renaming one without the other leaves one person under two
names on a single screen. The role is not in what the form can write,
and the rules refuse a change to it besides — editing yourself is never
a way to become something you aren't.

The write is queued, not awaited. A promise that settles on a server
acknowledgement doesn't settle at all in a basement, and a Save button
waiting on one is a button that never comes back; the name is the app's
from the moment it is typed, and a refusal arrives as its own toast.

A block you set up for yourself through the ordinary "Onboard a client"
form is an athlete nobody has claimed, so it sits in the roster waiting
for a code. **"This is me"** on that row folds it into your own view.
Nothing about the training moves — you were already its only member —
and the outstanding code is withdrawn, because there's nobody to give
it to.

**Endurance and power-endurance logs** — a modality picker, then a form
built from `CT.FORMS`, and as many of those as the evening had in it.

**One session, however many pieces of work were in it.** Ten rounds of
intervals and then twenty minutes of traversing is one trip to the wall.
It used to have to be logged as two sessions, which then ate two of the
week's endurance target for one evening's training — the app counting
exercises where it meant to count sessions. So a session carries a list:
each block has its own picker and its own form, **"Add another
exercise"** appends one, and the whole list saves against a single slot
and fills a single target. Four blocks is the ceiling; a sheet that
scrolls further than that is a sheet nobody finishes.

The notes are session-level and sit under the blocks, because they are
about the evening rather than about the third thing in it. (They also
used to live inside the form, which meant changing your mind about the
modality threw away whatever had been typed.)

Stored as `parts: [{ modality, fields }]`. Sessions written before this
carry a single `modality` and `fields` at the top level and are read
back as a list of one — migrated on read like everything else, never
rewritten, and re-saved in the new shape only if somebody edits one.
Strength is not in this at all: a hangboard session has reps per grip
rather than a modality, and its own shape already.

A day cell names the first block and counts the rest — **"Intervals
+1"** — because two names side by side fit nowhere and say less than one
name and a number. A history row gives each block a phrase and joins
them with a `+`, with less of the line each when there are several, and
takes the *hardest* of their efforts as the session's RPE. A drill-down
counts pieces of work rather than sessions, and says so in its heading
when the two numbers differ.

What the forms ask for:

*What you climbed.* A session is "2 × 6a, then 3 × 6a+, then 4 × 5c",
not the hardest thing in it. Routes, boulder 4×4s and long problems
all take as many grade/count rows as the session actually had,
in the order they were climbed, with a running total and the hardest
grade underneath. Traversing and Intervals take a single grade behind
a toggle — off by default, because most traverses have no grade anybody
would defend, and off is stored as nothing rather than as a guess.

*How far, if anybody counted.* Routes also take a distance in metres.
People leave the wall knowing one of two things — that they did 2 × 6a
and 3 × 6a+, or that they did 600 m — and plenty know both. So the
distance sits beside the grade rows rather than instead of them, and
**neither is required**: record either, both or neither and the session
still saves. An empty box is stored as nothing, not as zero, because a
session nobody measured is a different fact from a session where nothing
was climbed — and a chart reading a made-up 0 m would be worse than one
reading nothing at all.

*Hangboard or edge pulls.* One modality, two exercises: both hands on
a board splits the load, one hand does not, and comparing them is
meaningless. Logged apart, and the style is what the history rows and
day cells show. Both, and the 7:3 repeaters, also ask which grip —
half-crimp or three-finger drag, the same pair the strength protocol
runs on.

Nobody trains one grip and stops. A session is fifteen minutes on the
drag and fifteen on the half-crimp, which is **two blocks** of the same
exercise — and the second opens on everything the first one said, with
the grip moved along to the one the session hasn't used. Same edge, same
clock, other grip: one tap instead of six, with the load left to be
corrected, because it usually differs by grip. The grip leads the phrase
on a history row for the same reason — "Edge pulls · Edge pulls" would
be the least useful line a card could carry.

*How long on, how long off.* **Intervals** was "1-on-1-off", and the
protocol was welded into the label: the form asked for a round count
and nothing else, because the two clocks were in the name. Every other
ratio anybody actually climbs — 1 on 2 off most of all — was then either
unloggable or filed as a lie about its rest. So the modality is now
Intervals, the work and the rest are two duration boxes like any other,
and 1:1 is only where they open. Sessions recorded under the old form
are read as the 60 and 60 they meant, in `CT.migrateFields`, and not
rewritten. Under the boxes the form says what they come to — "10m
climbing · 28m start to finish" — because three numbers describing a
session that's either forty minutes or two hours is arithmetic nobody
does in their head mid-log. The rest between rounds is counted and the
one after the last round isn't; nobody serves a rest with nothing left
to climb. The same pairing reaches the history line, which now reads
`10 × 1m on, 2m off` rather than `10 rounds` — ten rounds of a minute
and ten of four were the same three words and are not the same session.

*Minutes and seconds.* Every duration is two boxes and is stored as
whole seconds. A 3:30 set used to be either 3 or 4.

*Effort on five points, each with a sentence.* 1 can sustain all day ·
2 light pump but sustainable · 3 feeling worked · 4 had to try hard ·
5 maximal all-out effort. The sentences are one tap away under "what
the numbers mean", with the picked one highlighted. Ten points asked
people to tell 6 from 7, which nobody does twice the same way.

**Climbing, as opposed to training** — a fourth kind of session. The
three the block prescribes are Strength, Endurance and Power Endurance;
this is the Saturday at the crag that nobody prescribed and everybody's
fingers remember on Monday. Until it existed the choice was to file one
as Endurance, which is a lie about what it was, or not at all — and a
record holding only the planned work can't explain a tired week.

It logs the way Routes does, because it's the same question. Pick which
it was — **Routes** or **Bouldering** — and the form asks what you
climbed, as grade/count rows off the matching ladder, plus time on the
wall and effort. Metres only on a rope: nobody counts the vertical on a
boulder problem, and a box nobody fills teaches people to skip past the
ones that matter. Two modalities rather than one form offering both
ladders, because a grade off the wrong ladder is worse than no grade,
and a day that was genuinely both was genuinely two sessions.

**It is plannable and it is not a target.** It sits on the calendar in
its own colour, drags between days, and shows up in the history and on
the charts like anything else — and `S.weekProgress` never counts it, so
no week is ever short of it and no streak turns on whether somebody went
climbing. The coach's weekly targets deliberately has no fourth stepper:
a target here would invite a coach to set one and then wonder why the
week never counted it. The pickers say **"Not a target"** on the row
itself, and the planning sheet says it in words.

**The guidebook ships with the app** — 2,138 routes across 16 crags at
Portland, precached by the service worker, because a crag is exactly
where there is no signal. Search by name from a Climbing log — or from
Endurance → Routes, since laps on route terrain are the same act wherever
they happen, and plenty of endurance volume gets done outdoors — and the
row carries the route's name, crag, grade and length, with the metres
adding themselves up rather than being typed from memory.

Three grade systems meet the app's two ladders, and each seam is a
decision rather than an accident:

*French sport* lands on the route ladder, which is the full French range
for exactly this reason — the old `4` / `4+` / `5a` shorthand had nowhere
to put 118 of Portland's routes. Sessions recorded under that shorthand
are translated on read, never rewritten.

*Font* lands on the boulder ladder through a table that takes the lower
V of each band. A conversion that rounds up flatters every session it
touches, and the numbers it flatters are the ones the progress charts
read.

*UK trad* lands nowhere, and that is the point. An adjectival grade
folds difficulty together with how much trouble you're in if you fall
off, and no single French number carries both — E1 5b is not 5b. So a
trad route is counted as a climb, keeps its real grade on screen, and
sits out of "hardest climbed". Absent is the honest answer.

Whichever seam a route came through, **the grade on screen stays the
guidebook's own words**. The ladder rung is a sort key, not a claim: a
row that reads f6B+ is stored against V4 and still says f6B+.

Two thirds of the routes have a length. **The rest can be typed in, and
that goes to a shared collection** so nobody measures the same route
twice — see the backend, because it's the first thing here that belongs
to no athlete.

**The search reaches exactly three modalities** — Endurance → Routes,
and both Climbing styles. Every other form keeps the plain grade ladder,
because a named route would mean nothing on a traverse or a hangboard,
and a modality that isn't on the list simply isn't offered one.

**Bodyweight** — clients log a reading whenever they weigh in, from the
dashboard tile or the Progress screen. One reading per day; logging the
same day again replaces it.

**Every reading on record is in the same sheet**, under the field you
type into, each one tappable to change and with a **Delete** beside it
that arms and confirms in place. A number typed once and regretted — a
guess at onboarding, a reading in boots — otherwise sits in the trend
dragging every chart that reads off it, and the only way out used to be
knowing to open Progress, flip the bodyweight card to **Table** and tap a
row. That path still works; this is the same act, put where somebody who
has just realised the old number is wrong is already standing.

Deleting one moves the trend and the charts and nothing else. Prescribed
loads keep the bodyweight they were actually worked out from, because
that is stored on the athlete as `refBodyweight` at the moment the sum
was done — a reading deleted afterwards was never what the load came
from, and rewriting the load to pretend otherwise would be a lie about a
hang somebody actually did.

**Weekly training volume** — the first card on Progress, and the only
place the block is visible as a whole. One stacked bar per week, a
segment per type, in the same colours the dots carry everywhere else,
with the numbers behind a Table toggle.

Climbing has no bar of its own here: it folds into Endurance, because a
day at the crag and a day of route laps are the same kind of work for a
volume overview, and a fourth bar that most weeks don't have reads worse
than three that every week does. The block's own targets leave climbing
out entirely; this doesn't.

**Tap a bar, or a legend entry, and it drills down** — the chart itself
redraws as that type's breakdown rather than a table appearing under an
unchanged one. The fold comes apart again on the way in: *Climb —
Routes* and *Climb — Bouldering* are their own rows, so the grouping is
a presentation and never a loss.

What a drill-down shows is whatever those sessions actually recorded and
nothing beyond it. Endurance and PE get metres, time on the wall, total
climbs, hardest route and hardest boulder, average effort, and the venues
by name rather than by count — counted across every piece of work in
those sessions, not just the first of each. Strength has no modality, so it breaks down
by what it does vary by: clean rate and kilos gained per grip, plus a
line for limit bouldering, which has no grip to report against.

**A stat with nothing behind it doesn't appear**, rather than showing up
as a confident zero. Traversing and Intervals keep no list of climbs to
pull a pitch count or a grade from; an empty metres box is not zero
metres. The same
distinction the log made when it recorded them has to survive being read
back.

Two of those numbers know less than they look like they do, and say so.
*Gained* is measured from wherever the load replay starts, which is
usually the block's opening but moves when a max is re-tested — so when
it has moved, the table says from when. And a 4×4's climbs are counted as
the four problems times the sets they went round, not the four problems,
because the other reading understates those sessions fourfold.

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
invites/{123456}                 the six digits ARE the id. athleteId,
                                 claimedBy, expiresAt, and kind: 'invite'
                                 (a coach's, 30 days) or 'device'
                                 (another screen for someone already in,
                                 30 minutes)
athletes/{id}                    members[] — one entry per screen —
                                 coachId, clientUid, invitePin, devicePin,
                                 block, targets, template, startLoads
  …/slots/{id}                   week, type, date, order, sessionId
                                 — order is the position within its day,
                                 absent on anything never rearranged
  …/sessions/{id}                date, type, mode, reps|problems, notes,
                                 parts[] — one { modality, fields } per
                                 piece of work; older ones carry a
                                 single modality/fields pair instead
  …/bodyweight/{yyyy-mm-dd}      one reading per day — the date is the key
  …/maxHang/{id}
  …/criticalForce/{id}           date, grip, bodyweight,
                                 hands.{left,right} — one test, both hands

routeLengths/{routeId}           m, by, at — how long a route is, where
                                 the shipped guidebook left it blank.
                                 The one collection outside the athlete
                                 records
```

A critical-force document carries the raw per-rep traces, which is most
of its ~40 KB against a 1 MiB limit. Kept whole rather than split off:
the trace is the only record of how a rep was actually pulled, and a test
is read as one thing.

`members` is the only thing access control reads, so one check governs
every subcollection. **Nothing derived is stored** — prescribed loads and
clean-session streaks are replayed from the session list on the client,
so no stored number can ever disagree with the sessions behind it.

**`routeLengths` is the exception to all of that**, and the only one. A
crag is a fact about the world rather than about anybody's training, so
those lengths belong to everyone who can see them and hang off no athlete
— which leaves `members` with nothing to say and the collection needing a
rule of its own shape. Anyone signed in may **create** a document there;
only a coach may **update** one. Firestore applies `create` solely where
no document exists yet, so that split is exactly "anyone may fill a
blank, nobody but a coach may change an answer": a mistyped 240 can be
corrected, and cannot quietly replace a number somebody measured. The id
is the app's own route slug — crag, area and name — so a document is
worthless without the guidebook to read it against and says nothing about
who climbed what.

It is read once at sign-in rather than listened to. It holds only the
blanks, it changes at the rate somebody climbs an unmeasured route, and a
live listener would be a socket held open for a number that will be the
same tomorrow. Writing one is deliberately not awaited either: the two
expected failures are somebody else filling the same blank first and a
phone at the bottom of a cliff, and neither is worth interrupting a log
to report — the length is already on that session whatever happens.

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

A device code is the same six digits against a door that is open for
thirty *minutes*, which is the window someone holding both screens
actually needs. It is also the only thing that can grow `members`, and it
can only be minted from inside the record it opens — so the reach it
hands out is bounded by the reach the minting device already had.

**A phone and a laptop** is one person on two screens, and the first code
can't do it. Spending it stamps one account, and every account after that
is a stranger to the record — a laptop opening the app is a *new*
anonymous account, not the same athlete signing in again, so re-typing
the code fails and is right to.

So the app has a second, smaller code. **"Use on another device"**, in
the sidebar under the sync line, mints six digits from a screen that
already works; type them on the laptop's code screen and that browser
joins the record. It lasts **30 minutes**, is spent on use, and hands out
nothing the device that minted it couldn't already see — it only lets
that reach travel. There is no limit on how many screens an athlete ends
up with. The coach has the same button under **Access** on the roster,
for when reading a code out is easier than talking somebody through
finding it, but it is not their job: the athlete can do it themselves,
which is the point.

`members` is therefore a list of *screens*. `clientUid` is still the one
person behind them and does not move, so the record goes on being theirs
however many browsers read it.

**Losing the phone** is the one thing that has no self-service fix, and
that's deliberate: there is no address to send a reset link to. The coach
opens **Access** on the roster and issues a new code, which puts the
record back to just them and opens it to whoever types the new one. Every
session, load and note stays exactly where it is. The replaced device
notices on next launch and says so, rather than showing an empty
dashboard that reads like a broken app.

That reset empties `members` completely — **every** screen, not only the
missing one — and withdraws any outstanding device code. It has to: when
it's the laptop you can't account for, signing out only the phone is the
wrong half. Putting the other screens back is one device code each, from
whichever one is re-claimed first.

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

**Reading what's already stored.** The field schemas have moved on:
minutes became seconds, a single grade became a list of them, effort
went from ten points to five, and route 4×4s were retired into Routes,
which records the same laps with more of the truth in them — the four
routes were each climbed once per set, so the sets fold into the counts
and four routes over four sets reads as sixteen climbs rather than
four. The route ladder also went from a `4` / `4+` / `5a` shorthand to
the full French range, so the grades stored under the old one are mapped
onto the new. Old documents aren't rewritten —
what someone recorded is what they recorded — so `CT.migrateSession`
translates them once, in `repo.js`, where the world is assembled.
Everything downstream only ever sees the current shape, and anything
saved after an edit lands in it for good.

Effort is the awkward one: a stored 4 means "had to try hard" on the
new scale and something nearer the opposite on the old, and the number
alone doesn't say which. So every session saved from here on carries
`rpeScale: 5`, and a session that doesn't carry it is one from before
the change and gets halved.

## Deliberately placeholder

The exact chart types and the streak rules.

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
js/data.js             taxonomy, field schemas, the legacy-shape
                       migration, and the mock world, generated
                       relative to today's date
js/crags.data.js       Portland as five columns per route. Generated —
                       don't hand-edit it
js/crags.js            the guidebook, searchable: three grade systems
                       onto the app's two ladders, and how long a route
                       is. Loads after data.js, whose ladders it reads
js/store.js            derived state, the progression rule, rest-day rules
js/ui.js               DOM helpers, icons, the GSAP motion vocabulary
js/charts.js           hand-rolled SVG charts, each fitting its own
                       labels to the room it has — SVG text neither
                       wraps nor clips, so nobody else can do it for them
js/views/              signin (the code pad, and the coach's way in) ·
                       dashboard · schedule · progress · coach ·
                       invite (a code, how to replace it, and how to
                       add a second screen)
js/logs/               strength — hangboard + limit bouldering; also owns
                       the sheet shell and the date bar ·
                       session (endurance, PE, climbing, bodyweight,
                       type chooser, plan-ahead picker, the route
                       search, and the field controls every form is
                       built from) ·
                       loads (the max/share/working-load control, shared
                       with onboarding, and the sheet that re-bases a
                       block mid-flight) · onboard ·
                       cfupload (device files in, confirmed by the coach)
js/app.js              shell, routing, user switching
sw.js                  the offline shell, network-first. Every file
                       above is named in its precache list
routes_with_length.csv the guidebook as typed, and the only copy of it
                       worth editing
tools/build-crags.mjs  that CSV → js/crags.data.js. Run by hand when the
                       CSV changes; not a build step, of which there
                       are none
```

Every animation degrades to an instant state change when GSAP is absent
or `prefers-reduced-motion` is set.

Installed to a home screen, the app suppresses pinch zoom, double-tap
zoom and pull-to-refresh — an over-scroll shouldn't reload the page
mid-log. Opened in a browser tab it leaves all three alone; taking them
from a page someone is merely visiting would be hostile.

**The hardware back button** gets the same treatment. Installed, there
is no address bar and no tab strip, so back is the only navigation
control on the device — and with nothing standing in its way it quits,
from anywhere, including out of a half-filled log sheet. So it peels one
layer at a time: the sheet, then the drawer, then whatever screen you
wandered onto, and at the bottom it stops. There is nowhere behind the
home screen of an app you opened from an icon.

In a browser tab it does not trap you. Back there genuinely means "the
page before this one", and a site that refuses to let you leave is a
site behaving badly. The layers still unwind; only the floor isn't laid.

The mechanism is one spare history entry, re-armed after every press
rather than one entry per layer. Nothing is mirrored from app state into
history, so nothing can drift out of step with it — each press asks the
live app what the innermost open thing is and closes that. It reads the
sheet's own `showing` flag rather than looking for its node, because a
sheet on its way out is in the document for another fifth of a second,
and a quick second press has to move up a level rather than close the
same sheet twice.
