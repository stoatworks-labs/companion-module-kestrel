# Kestrel

Routes regions of interest to DeckLink outputs from a control surface, through
[Kestrel](https://github.com/stoatworks-labs/kestrel).

## Connection

Kestrel's control API — the address along the bottom of Kestrel's own window,
`127.0.0.1:9720` by default.

**There is no authentication.** Anyone who can reach that port can re-route
every output and kill them all at once. Keep it on a management interface, not
on a show network anyone can join.

## The crosspoint

**Take region to output** is the whole idea: one region of the input picture,
onto one SDI output. The dropdown carries a **— clear —** entry, which drops the
crosspoint without stopping the output — it falls back to its idle fill.

**Cycle the region on an output** steps forward or back through the regions, and
can optionally include "nothing routed" in the cycle. It exists for a surface
with fewer buttons than the show has regions.

**Salvo** puts one region on *every* output at once. **Outputs on / off** is the
global kill.

## Tally

**Crosspoint is taken** colours the button in the region's own colour, taken from
Kestrel, so a surface matches the operator's screen without anyone maintaining a
second colour scheme. It **dims rather than clears** when the outputs are killed:
the routing is still what it was, it is simply not going anywhere.

**Output is carrying a region** is the stricter one — true only when that output
is really on air. Muted, unrouted, or the input gone, and it is false.

**Input is locked** deserves a button of its own. When it is false, every routed
output is carrying black, and nothing else on the surface will tell you that.

## Two things that will not do what you expect

**Nudging a region is safe to hold down.** Kestrel clamps at the frame edge
rather than refusing the command, so a held button walks the region to the edge
and stops.

**Killing the transmitter does not remove the signal.** A DeckLink output goes on
sending locked black long after the process that opened it has exited, so
"outputs off" is not a way to prove to a downstream device that the source has
gone. Pull the cable if that is what you are testing.

## How much to trust it

The module's own checks run against a fake Kestrel, so they prove the module's
shape rather than that the two ends agree. Kestrel itself has been verified
against real SDI hardware; this module talking to it has not been run in a show.
