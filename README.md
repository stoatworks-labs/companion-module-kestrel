# companion-module-kestrel

> **AI-assisted project.** This codebase was created with [Claude](https://claude.com/claude-code)
> (Anthropic), directed and reviewed by a human author. Its 21 automated checks
> run against a fake Kestrel, so they prove the module's own shape rather than
> that the two ends agree; the live test against a really-running Kestrel is the
> one that matters when either side changes.

A [Bitfocus Companion](https://bitfocus.io/companion) module for
[Kestrel](https://github.com/stoatworks-labs/kestrel) — take any region of
interest to any DeckLink output from a control surface, with live tally.

<!-- downloads:start -->

## Download

**[v1.0.0](https://github.com/stoatworks-labs/companion-module-kestrel/releases/tag/v1.0.0)**

This release contains:

- [`companion-module-kestrel-pkg.tgz`](https://github.com/stoatworks-labs/companion-module-kestrel/releases/latest/download/companion-module-kestrel-pkg.tgz) — npm package, 23 KB
- [`kestrel-1.0.0.tgz`](https://github.com/stoatworks-labs/companion-module-kestrel/releases/download/v1.0.0/kestrel-1.0.0.tgz) — npm package, 22 KB

All builds, checksums and release notes: [github.com/stoatworks-labs/companion-module-kestrel/releases](https://github.com/stoatworks-labs/companion-module-kestrel/releases).

<!-- downloads:end -->

## Setup

Point it at Kestrel's control API — the address along the bottom of Kestrel's
window, `127.0.0.1:9720` by default.

**There is no authentication.** Anyone who can reach the port can re-route every
output and kill them all. Keep it on a management interface.

## Actions

|                                   |                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Take region to output**         | the crosspoint. Includes a "— clear —" entry.                                                              |
| **Clear an output**               | drops the crosspoint. The output keeps running on its idle fill.                                           |
| **Cycle the region on an output** | steps forward or back, optionally through "nothing routed". For a surface with fewer buttons than regions. |
| **Salvo**                         | one region to every output at once.                                                                        |
| **Outputs on / off**              | the global kill — on, off or toggle.                                                                       |
| **Set an output's idle fill**     | black, bars, or the full input.                                                                            |
| **Nudge a region**                | move it by a percentage of the frame.                                                                      |

## Feedbacks

|                                 |                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| **Crosspoint is taken**         | tally, in the region's own colour from Kestrel, dimmed when the outputs are killed.    |
| **Output is carrying a region** | true only when it is really on air — false when muted, unrouted, or the input is gone. |
| **Outputs are on**              | for the kill button itself.                                                            |
| **Input is locked**             | false means every routed output is carrying black.                                     |
| **Output is scaling too far**   | above a threshold you set.                                                             |

## Variables

Globals: `input_live`, `input_size`, `input_device`, `output_format`,
`outputs_enabled`, `roi_count`, `output_count`, `decklink`.

Per output: `out_N_label`, `out_N_roi`, `out_N_scale`, `out_N_on_air`,
`out_N_device`. Per region: `roi_N_name`, `roi_N_outputs`.

`out_N_scale` is the magnification that output is applying — the number worth
putting on the button, because it says how much of the picture is being
invented. It is empty for an unrouted output rather than `0%`.

## Presets

A crosspoint button per region per output, grouped by output, plus a clear and a
cycle button for each — and the global kill and an input-lock tally. The
crosspoint list is capped (200 by default) because eight outputs and a dozen
regions is ninety-six buttons.

## Tests

```bash
npm test                          # against a fake Kestrel: 21 checks
node test/live.mjs 127.0.0.1:9720 # against a really running one, or skips
```

The live test is the one that matters when either side changes shape — the fake
in the smoke test cannot notice that it has drifted from the real thing. It
restores whatever routing it found, so it is safe on a configured machine and
**not** on one that is on air.

MIT.

<!-- attributions:start -->
This project is built on other people's work — see [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
<!-- attributions:end -->
