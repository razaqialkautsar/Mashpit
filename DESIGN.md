# Design — Mashpit dashboard

Source of truth for the visuals: `mashpit.pen` (pen.dev), frames `Components`, `Live — desktop`, `Job detail — desktop`, `Keepers — desktop`, `New job — desktop`, `Live — mobile`, `Job detail — mobile`. The pen.dev variables mirror the tokens below.

## World

A dark arena lit by heat. Neutrals are warm near-blacks, and the only light source is the orange from the logo, which runs to amber the closer something gets to "now". The idea is **hot potato**: whatever is live, due, or at risk of being slashed glows. Everything else stays quiet.

**Signature move: the heat track.** A round's five phases (Commit → Reveal → Awarded → Exclusive → Settled) are drawn as segmented bars. Done phases are dimmed to `accent-deep`. The current phase fills from orange to amber as its blocks run out. In tables, the same bar shows how much of the winner's exclusive window is left. Slashing and failover use a flame icon on an `accent-soft` pill.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `bg` | #0C0A09 | page |
| `surface` / `surface-2` / `surface-3` | #161311 / #1F1A17 / #2A231F | panels, table heads, chips |
| `line` / `line-strong` | #2B2521 / #3D342E | dividers, inputs |
| `text` / `text-2` / `text-3` | #F5EFE9 / #B3A9A1 / #8C8179 | primary, secondary, labels (all ≥ 4.5:1 on `surface`) |
| `accent` | #E6502B | logo orange: primary buttons, Exclusive phase, winner avatar |
| `accent-deep` / `accent-soft` | #802D18 / #3A1A10 | completed phases; tinted pills (Leading, Failover, Owner) |
| `accent-ink` | #1A0B05 | text on `accent` (white on #E6502B fails AA for small text) |
| `amber` / `glow` | #FFB54A / #FFD38A | current phase, live countdowns, winning bid, balances |
| `ok` / `warn` / `bad` (+ `-bg`) | #5BD69A / #E8C15A / #FF6B5C | Paid / Returned false / Failed |

Heat glow on hero panels is a radial gradient of `accent` at 25–35% alpha, fading to 0. Use it only on the one panel per page that holds the live round or the main action.

## Type

- **Display:** Oddval Text SemiBold for page titles (44 desktop / 32 mobile), method names, panel titles (20–28) and countdown numerals (64–88). The italic is reserved for the "Mashpit" wordmark.
- **Body:** Plus Jakarta Sans. 15 for lede text, 13–14 for table cells, 12 for labels. Column headers are 11 bold uppercase with +0.6 tracking.
- **Code:** JetBrains Mono, only for real identifiers: account IDs, method names in tables, args JSON, block numbers, hashes.

## Components

- **Navbar:** logo on the left; a pill-segmented nav in the center (Live, Keepers, New job); network status and wallet button on the right. Once a wallet is connected, the button turns into the account chip.
- **Phase pill:** icon plus label, never color alone. Commit `lock`, Reveal `eye`, Awarded `trophy`, Exclusive `flame` (solid accent), Open `lock-open`, Settled `circle-check`.
- **Outcome:** icon plus colored label plus amount. A failover gets an extra flame pill that names the slashed keeper.
- **Bid row:** keeper avatar (accent when leading), account, commit offset, bid in display type, and the AI memo quoted in plain text. Sealed bids show the lock icon, the hash, and the bond at risk.
- **Radii:** 20–24 for panels, 12–14 for inputs and tiles, pills for chips and buttons. No shadows; elevation comes from surface steps and 1px lines.

## Layout

- Desktop is 1440 wide with 40 px side gutters, and panels sit 24–28 px apart. Stats render as an inline divided strip, not as metric cards.
- On mobile (390), tables become stacked rows, navigation moves to a bottom tab bar, and owner actions sit in a sticky bottom bar.
- Numbers in the mockups are layout examples, not live data.
