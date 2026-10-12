# Companion — Kestrel user guide

This module routes regions of interest to DeckLink outputs from a Stream Deck or any other
Bitfocus Companion surface, through [Kestrel](https://github.com/stoatworks-labs/kestrel). You can
take any region to any output, cycle regions on an output, fire a salvo and kill every output at
once, with live crosspoint tally.

The [README](../README.md) covers installing the module. This guide is about building a page with
it.

> **Before you rely on this:** the module's 21 automated checks run against a **fake Kestrel**, so
> they show the module's own shape is right but not that the two ends agree. Kestrel itself has
> been verified against real SDI hardware; this module driving it hasn't been used in a show.
> When either side changes, the live test against a Kestrel that's actually running is the one
> that matters.
>
> **If the connection comes up with no actions, variables or presets at all**, you're on a version
> that dies during startup. Upgrade to the newest release before you look at anything else.
>
> This module was built with AI assistance, directed and reviewed by a human author.

---

## Connecting

Kestrel's control API: the address along the bottom of Kestrel's own window, `127.0.0.1:9720` by
default.

> **There's no authentication.** Anyone who can reach that port can re-route every output and
> kill the lot at once. Keep it on a management interface, not on a show network anyone can join.

**Max crosspoint presets** in the connection config caps how many buttons a big show generates.

---

## The crosspoint

**Take region to output** is what this is all about: one region of the input picture, onto one SDI
output.

The dropdown has a **— clear —** entry, which drops the crosspoint **without stopping the
output**, so it falls back to its idle fill. That matters on a rig where something downstream is
watching for signal, because clearing a crosspoint isn't the same as killing an output.

**Cycle the region on an output** steps forward or back through the regions, and can include
"nothing routed" in the cycle if you want. It's there for a surface with fewer buttons than the
show has regions.

**Salvo** puts one region on *every* output at once. **Outputs on / off** is the global kill.

**Set an output's idle fill** picks black, bars or the full input for when nothing's routed. Bars
is the one to go for when somebody downstream needs to see that the path is alive.

---

## Tally, and the two feedbacks that differ

**Crosspoint is taken** colours the button **in the region's own colour, taken from Kestrel**, so
the surface matches the operator's screen and nobody has to keep a second colour scheme up to
date.

It **dims rather than clears** when the outputs are killed. The routing's still what it was, it
just isn't going anywhere, and that's worth knowing during a kill rather than staring at a blank
page.

**Output is carrying a region** is the stricter one: it's only true when that output is *properly
on air*. If it's muted, unrouted or the input's gone, it's false.

**Input is locked deserves a button of its own.** When it's false, **every routed output is
carrying black**, and nothing else on the surface will tell you so.

**Output is scaling too far** warns you above a threshold you set. It's the failure that doesn't
announce itself: everything's routed correctly and a region is being blown up further than it can
take.

---

## Two things that will not do what you expect

**It's safe to hold down a nudge button.** Kestrel clamps at the edge of the frame rather than
refusing the command, so a held button walks the region to the edge and stops there.

**Killing the transmitter doesn't remove the signal.** A DeckLink output carries on sending locked
black long after the process that opened it has exited. Measured twenty seconds after the fact, a
looped-back input still reported a good, locked 1080p50 signal. (Nobody told the card.)

So **"outputs off" is no way to prove to a downstream device that the source has gone.** If that's
what you're testing, pull the cable.

---

## Building a surface that fails safe

1. **Input is locked**, big and obvious. It's the one failure that makes every other light on the
   page a lie.
2. **Crosspoint tally in Kestrel's own region colours**, so the surface and the screen agree.
3. **Output-is-carrying** on anything that reads as "on air", rather than the crosspoint tally.
4. **Scaling-too-far with a sensible threshold**, set from what the show's outputs can take.
5. **The global kill somewhere you have to mean to reach.** It's one press with no confirmation.

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

- [README](../README.md): installing, and the full list of actions, feedbacks and variables
- [`companion/HELP.md`](../companion/HELP.md): the same material, in Companion's help panel
