# Companion — Kestrel user guide

This module routes **regions of interest to DeckLink outputs** from a Stream Deck or any other
Bitfocus Companion surface, through [Kestrel](https://github.com/stoatworks-labs/kestrel) — take
any region to any output, cycle regions on an output, fire a salvo, kill every output at once,
with live crosspoint tally.

The [README](../README.md) covers installing the module. This is how to build a page with it.

> **Before you rely on this:** the module's 21 automated checks run against a **fake Kestrel**, so
> they prove the module's own shape rather than that the two ends agree. Kestrel itself has been
> verified against real SDI hardware; this module driving it has not been used in a show. The live
> test against a really-running Kestrel is the one that matters when either side changes.
>
> **If the connection comes up with no actions, variables or presets at all**, you are on a
> version that dies during startup — upgrade to the newest release before investigating anything
> else.
>
> This module was built with AI assistance, directed and reviewed by a human author.

---

## Connecting

Kestrel's control API — the address along the bottom of Kestrel's own window, `127.0.0.1:9720` by
default.

> **There is no authentication.** Anyone who can reach that port can re-route every output and
> kill them all at once. Keep it on a management interface, not on a show network anyone can join.

**Max crosspoint presets** in the connection config caps how many buttons a large show generates.

---

## The crosspoint

**Take region to output** is the whole idea: one region of the input picture, onto one SDI output.

The dropdown carries a **— clear —** entry, which drops the crosspoint **without stopping the
output** — it falls back to its idle fill. That distinction matters on a rig where a downstream
device is watching for signal: clearing a crosspoint is not the same as killing an output.

**Cycle the region on an output** steps forward or back through the regions, and can optionally
include "nothing routed" in the cycle. It exists for a surface with fewer buttons than the show
has regions.

**Salvo** puts one region on *every* output at once. **Outputs on / off** is the global kill.

**Set an output's idle fill** chooses black, bars, or the full input for when nothing is routed —
bars being the one to pick when somebody downstream needs to see that the path is alive.

---

## Tally, and the two feedbacks that differ

**Crosspoint is taken** colours the button **in the region's own colour, taken from Kestrel**, so
the surface matches the operator's screen without anyone maintaining a second colour scheme.

It **dims rather than clears** when the outputs are killed: the routing is still what it was, it
is simply not going anywhere. That is information you want during a kill, not a blank page.

**Output is carrying a region** is the stricter one — true only when that output is *really on
air*. Muted, unrouted, or the input gone, and it is false.

**Input is locked deserves a button of its own.** When it is false, **every routed output is
carrying black**, and nothing else on the surface will tell you that.

**Output is scaling too far** warns above a threshold you set — the quiet quality failure, where
everything is routed correctly and a region is being blown up past what it can stand.

---

## Two things that will not do what you expect

**Nudging a region is safe to hold down.** Kestrel clamps at the frame edge rather than refusing
the command, so a held button walks the region to the edge and stops there.

**Killing the transmitter does not remove the signal.** A DeckLink output goes on sending locked
black long after the process that opened it has exited — measured twenty seconds after the fact, a
looped-back input still reported a good, locked 1080p50 signal.

So **"outputs off" is not a way to prove to a downstream device that the source has gone.** Pull
the cable if that is what you are testing.

---

## Building a surface that fails safe

1. **Input is locked**, prominent. It is the single failure that makes every other light on the
   page a lie.
2. **Crosspoint tally in Kestrel's own region colours**, so the surface and the screen agree.
3. **Output-is-carrying** on anything that reads as "on air", rather than the crosspoint tally.
4. **Scaling-too-far with a real threshold**, set from what the show's outputs can stand.
5. **The global kill somewhere deliberate** — it is one press with no confirmation.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| **No actions or presets at all** | The module died during startup. Upgrade. |
| **Everything is routed and every output is black** | The input is not locked. Add that feedback. |
| **Tally is dim rather than lit** | Outputs are killed. The routing is intact. |
| **A downstream device still sees signal after outputs off** | The card keeps transmitting after the process exits. This is not the module. |
| **A region will not move any further** | It is clamped at the frame edge, by design. |
| **The picture is soft on one output** | Scaling too far — the feedback exists for exactly this. |

---

## See also

- [README](../README.md) — installing, and the full action/feedback/variable list
- [`companion/HELP.md`](../companion/HELP.md) — the same material, in Companion's help panel
