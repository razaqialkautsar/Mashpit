# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Proposed in docs/PRD.md D4: Vite + React + TypeScript, built as a static site that reads the contract over public NEAR RPC. Final call is Bayu's (frontend owner).

## Users

- **Primary for the dashboard: hackathon judges and observers (P4).** They open the Live page without a wallet, during or after the demo, and need to see the keeper market working: a round moving through commit → reveal → award → execution, what each AI keeper bid, and why.
- **Job owners (P1 protocol operators such as LiNEAR/Meta Pool; P2 dApp developers).** Register a scheduled contract call, cap the reward, top up or close the job.
- **Keeper operators (P3).** Check stake, locked stake, rewards, executions and slashes.

## Product Purpose

Mashpit is a contract on NEAR testnet where AI keeper agents compete in a commit-reveal auction to run scheduled calls for other contracts (e.g. LiNEAR `epoch_update_rewards` each epoch). Keepers are paid only when the callback proves success; an auction winner that misses its exclusive window is slashed and the job opens to any keeper. Success for the hackathon: a real `epoch_*` job executed through Mashpit, ≥3 keepers, ≥1 auction with ≥2 revealed bids plus AI reasoning, and ideally one visible failover.

## Positioning

An open, incentivized keeper market enforced on-chain, replacing single-account bots and GitHub Actions cron. Name: **mash**ed potato + **mosh pit**, an arena where agents scramble for jobs under hot-potato rules: hold the job too long and your stake burns.

## Operating Context

- Dashboard is read-only, polls RPC every ~3 s, no backend, no login needed to view.
- Countdowns are in blocks with "≈" seconds (~0.58 s/block on testnet).
- Round phases come from the contract (`Commit`, `Reveal`, `Awarded`, `Exclusive`, `Open`, `Settled`); execution outcomes are `Paid`, `ReturnedFalse`, `Failed`; rows with `slashed_keeper` are failovers.
- AI memos are untrusted keeper text, rendered as plain text, ≤280 bytes.
- Wallet connection (NEAR Connect) only for New job and owner actions (P1).

## Capabilities and Constraints

- Pages: Live (`/`), Job detail (`/jobs/:id`), Keepers (`/keepers`), New job (`/new`, P1); owner actions (top up, pause/resume, close) on job detail only for the job owner.
- Must work on desktop and phone; tables may scroll horizontally on small screens.
- Amounts are NEAR from yocto strings; gas in Tgas, total ≤ 300 Tgas.
- No mock data in the shipped app; numbers in design mockups are layout examples only.

## Brand Commitments

- UI language: English.
- Logo: the final "mp" mark (Logo-fix frame in mashpit.pen), orange #E6502B with a gradient.
- Fonts: Oddval Text SemiBold / SemiBold Italic for headings (the word "Mashpit" set in the italic, orange); Plus Jakarta Sans for body.
- References the user made binding (in mashpit.pen): dark dashboard with orange accent and bento cards (dashboard reference), glowing orange-to-amber heat gradient and centered pill navbar (color & navbar reference), large rounded cards with big numerals and pill chips (layout & typography reference).

## Evidence on Hand

- Real facts usable in copy: 22 of 454 hackathon repos built their own keeper bots; LiNEAR mainnet `epoch_*` calls all came from one account (`governorlin.near`); GitHub Actions minimum 5-minute interval and dropped jobs (sources in docs/PRD.md §1.1).
- No live contract data yet; no testimonials, users, or metrics. Do not fabricate them.

## Product Principles

1. Show the auction, don't describe it: phase, bids, and AI reasoning are the hero.
2. Every number traces to a view method; nothing is computed client-side that the contract already decides.
3. Honest outcomes: paid, returned-false, failed and slashed are equally visible.
4. Readable without a wallet; the wallet only appears where it is needed.

## Accessibility & Inclusion

WCAG 2.1 AA contrast on the dark theme; phase and outcome never conveyed by color alone (label + shape); countdowns readable as text.
