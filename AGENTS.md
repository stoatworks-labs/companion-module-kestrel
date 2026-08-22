# companion-module-kestrel — orientation

The Companion end of [Kestrel](https://github.com/stoatworks-labs/kestrel).
`README.md` is what it does; this is the why and the traps.

## Shape

Follows the house pattern set by `companion-module-srt-router`: `main.js` holds
the instance and the state, `api.js` the transport, and `actions.js` /
`feedbacks.js` / `variables.js` / `presets.js` are each rebuilt from the live
state.

Two channels, carrying different things:

- **`/ws`** — the whole state, pushed. Kestrel re-snapshots at 5 Hz and sends
  only when its revision moved, so this covers routing _and_ membership: a
  region created by dragging in Kestrel's own window appears here with no
  polling at all.
- **HTTP** — commands.

`applyState` distinguishes a **membership** change (a region or output created,
renamed, recoloured, or re-carded) from a **routing** change. Only the first
re-registers actions, feedbacks, variables and presets. Routing changes are far
more frequent, and rebuilding every definition on each one makes a busy show
crawl.

## Traps

**Kestrel refuses with HTTP 200 and `ok:false`.** Checking the status code alone
reports every refusal as a successful take. `api.js` throws on `ok === false`;
`ModuleInstance.command` catches it, logs it and puts the message in the
instance status. Kestrel always populates `error`, so — unlike its sibling
srt-router — this module never has to invent the text.

**`@companion-module/base` 2.x has no `runEntrypoint`.** Export the default
class and `UpgradeScripts` and let Companion import them. Calling it fails at
import time with a bare `SyntaxError` naming the export rather than the version,
which sends the hunt the wrong way.

**Base 2.x definition shapes — all four of these ship silently.** v1.0.0 was
published with the first three live and its test suite green throughout, because
the fixture was more permissive than the real host. It could not be installed at
all.

- **Variable definitions are an OBJECT keyed by id**, not the 1.x array of
  `{ variableId, name }`. `setVariableDefinitions` _throws_ on an array, which
  fails `init()` and leaves a dead connection with no actions, no variables and
  no presets. `rebuild()` defines variables before presets, so it takes the
  preset library down with it.
- **`setPresetDefinitions` takes TWO arguments** — an array of sections, then a
  flat object of definitions keyed by id. Grouping comes from the structure. A
  1.x `category` field on a definition still loads and the presets simply never
  appear, which reads as a rendering bug rather than a mistake. `type` is
  `'simple'`, not `'button'`.
- **Variable references resolve against the CONNECTION's label**, which the user
  can rename — not against the module id. A hardcoded `$(kestrel:…)` renders as
  literal text on every install not named `kestrel`. Build them from
  `self.label`.
- **`checkFeedbacks()` bare checks nothing.** It takes one or more feedback
  _types_ and forwards them as a filter, so calling it with no arguments sends
  `[undefined]` and matches none. Use `checkAllFeedbacks()`. This one fails
  silently rather than loudly: the module loads and routes correctly, and every
  tally on the surface freezes at its last value. Routing changes take
  `applyState`'s non-membership path, which is the common case on a busy show.

The fixture in `test/smoke.mjs` now mirrors the real host on all four — it
throws on an array, asserts the two-argument preset call, rejects a bare
`checkFeedbacks`, and checks every preset's variable prefix against
`self.label`. Keep it strict; a permissive fixture is what let v1.0.0 out.

**`InstanceBase`'s constructor refuses to run outside Companion's host.** The
tests build an instance with `Object.create(ModuleInstance.prototype)` and
attach the host methods by hand. The obvious alternatives — subclassing, or a
plain object with the same shape — test a _copy_ of the logic, and `applyState`,
`nextRoi` and `command` are exactly the parts worth testing. (The sibling module
takes the plain-object route; that is the thing to improve there, not to copy
here.) `label` is a getter backed by a private field, so on a prototype-built
instance it _throws_ rather than returning undefined — the fixture defines it as
an own property, which shadows the getter.

**Stepping into a cycle from outside it.** `nextRoi` returns `null` for "nothing
routed", which is a real position, not a failure. When the current position is
not in the ring — the output carries nothing and "none" was excluded, or the
region it carried has been deleted — it steps in from _outside_ rather than
pretending to be at index 0 and stepping again. The naive version silently skips
the first region on the first press; a test catches it.

**A null scale must not read as a warning.** An unrouted output has
`scale_percent: null`, and `null > 200` happens to be false in JavaScript — by
luck, not by design. The `scale_over` feedback checks for null explicitly.

**A muted crosspoint must not look like an on-air one,** or the global kill is
invisible from the surface. The `crosspoint` feedback dims the region's colour
when `outputs_enabled` is false.

## Verified

- `npm test` — 31 checks against a fake Kestrel: definitions, presets and the
  cap, the tally feedbacks, the cycle arithmetic, every command's endpoint and
  body, that a 200-with-`ok:false` is treated as a failure, and the base-2.x
  surface above — variable and preset shapes, the label-derived variable prefix,
  and that every preset's actions, feedbacks and variable references resolve to
  something that exists.
- `node test/live.mjs <host:port>` — 8 checks against a **really running
  Kestrel**: the WebSocket feed, that every field this module reads is actually
  present, a real take landing, the scale variable, the global kill muting
  everything while keeping the routes, a clear leaving the output running, and a
  refusal carrying Kestrel's own message. It restores the routing it found.

The live test is the one that matters when either side changes shape — the fake
cannot notice it has drifted from the real thing. Run it after any change to
Kestrel's `StateView`.

**Never done:** loaded into a real Companion instance, or pressed on a real
Stream Deck.
