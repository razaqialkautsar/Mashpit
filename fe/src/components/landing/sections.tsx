import { Brand } from "./brand";
import { RoundDemo } from "./round-demo";

const h2 = "text-[clamp(2rem,4.2vw,3.25rem)]";
const lede = "max-w-[56ch] text-[clamp(1rem,1.3vw,1.125rem)] text-ink-2";

const facts = [
  {
    figure: "22 of 454",
    text: "hackathon repos we scanned built their own keeper bot, each one from scratch.",
  },
  {
    figure: "1 account",
    text: "sent all of the last 100 epoch_* calls to LiNEAR on mainnet.",
    source: { label: "NearBlocks, 13 Nov 2026", href: "https://nearblocks.io/address/linear-protocol.near" },
  },
  {
    figure: "5 minutes",
    text: "is the shortest GitHub Actions schedule, and runs can be delayed or dropped.",
    source: {
      label: "GitHub docs",
      href: "https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule",
    },
  },
];

export function Problem() {
  return (
    <section id="problem" className="section-y border-t border-line">
      <div className="wrap grid gap-[clamp(32px,6vw,96px)] md:grid-cols-[0.9fr_1.1fr]">
        <div data-reveal>
          <h2 className={h2}>Contracts can’t call themselves.</h2>
          <p className={`${lede} mt-5`}>
            Anything that must run every epoch depends on somebody’s bot. Usually one account, on
            one server, with nobody to take over when it stops.
          </p>
        </div>
        <ul data-reveal>
          {facts.map((f) => (
            <li
              key={f.figure}
              className="grid items-baseline gap-x-6 gap-y-1.5 border-t border-line py-[22px] last:border-b sm:grid-cols-[11rem_1fr]"
            >
              <b className="font-display text-[clamp(1.6rem,2.8vw,2.25rem)] leading-none font-semibold tracking-[-0.02em] text-glow">
                {f.figure}
              </b>
              <p className="text-[15px] text-ink-2">
                {f.text}{" "}
                {f.source && (
                  <a
                    href={f.source.href}
                    className="text-[13px] whitespace-nowrap text-ink-3 underline underline-offset-[3px] hover:text-ink"
                  >
                    {f.source.label}
                  </a>
                )}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const steps = [
  { title: "Post", text: "Pick the contract, method and schedule. Set a max reward and deposit NEAR." },
  { title: "Bid", text: "Keepers commit sealed bids, then reveal them with their AI’s reasoning." },
  { title: "Run", text: "The lowest bid wins and makes the call the moment it’s due." },
  { title: "Pay", text: "The callback checks the result. Success pays the bid. Failure pays nothing." },
];

export function HowItWorks() {
  return (
    <section id="how" className="section-y border-y border-line bg-surface">
      <div className="wrap grid items-start gap-[clamp(32px,6vw,88px)] lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <h2 className={h2} data-reveal>
            One round, four moves.
          </h2>
          {/* The numbers stay: this is a sequence, and the order is the content. */}
          <ol className="relative mt-[clamp(28px,4vw,48px)] grid gap-8 border-l-2 border-line-strong pl-7">
            <span
              data-draw
              aria-hidden="true"
              className="absolute top-0 -left-0.5 h-full w-0.5 origin-top bg-linear-to-b from-accent to-amber"
            />
            {steps.map((s, i) => (
              <li key={s.title} data-reveal>
                <span className="grid size-7 place-items-center rounded-full bg-surface-3 text-[13px] font-extrabold text-amber">
                  {i + 1}
                </span>
                <h3 className="mt-3 text-2xl tracking-[-0.015em]">{s.title}</h3>
                <p className="mt-1.5 max-w-[44ch] text-[15px] text-ink-2">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
        <div data-reveal>
          <RoundDemo />
        </div>
      </div>
    </section>
  );
}

const failover = [
  { at: "due", text: "k2 won the round and holds the job." },
  { at: "+50 blk", text: "k2 never executes. The window closes." },
  { at: "slash", text: "0.05 NEAR leaves k2’s stake and lands in your job balance." },
  { at: "+61 blk", text: "k3 runs the call in open mode and gets paid." },
];

export function HotPotato() {
  return (
    <section id="burn" className="section-y bg-accent text-accent-ink">
      <div className="wrap grid items-center gap-[clamp(32px,6vw,96px)] md:grid-cols-2">
        <div data-reveal>
          <h2 className="text-[clamp(2.25rem,5vw,4rem)] leading-none">
            Hold it too long and you get burned.
          </h2>
          <p className="mt-5 max-w-[52ch] text-[clamp(1rem,1.3vw,1.125rem)] font-medium">
            The winner gets 50 blocks to run the job. Miss that window and their stake is slashed,
            you are compensated, and any keeper can grab the job.
          </p>
          <p className="mt-6 font-display text-xl font-semibold italic">
            Mashed potato + mosh pit = Mashpit.
          </p>
        </div>
        <ol data-reveal>
          {failover.map((f) => (
            <li
              key={f.at}
              className="grid grid-cols-[5.5rem_1fr] gap-4 border-t border-accent-ink/30 py-4 font-semibold last:border-b"
            >
              <span className="pt-0.5 font-mono text-[13px] font-medium">{f.at}</span>
              {f.text}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const columns = ["Your own bot", "GitHub Actions", "Mashpit"] as const;
const rows = [
  {
    label: "Who runs it",
    cells: ["One account you maintain", "GitHub’s shared scheduler", "Any keeper with stake"],
  },
  {
    label: "If a run is missed",
    cells: [
      "Nothing, until you notice",
      "Runs can be delayed or dropped",
      "Winner is slashed, another keeper takes over",
    ],
  },
  {
    label: "What you pay",
    cells: [
      "A server, all the time",
      "Free, at 5-minute intervals or slower",
      "Successful runs only, capped by your max reward",
    ],
  },
];

export function Compare() {
  return (
    <section id="compare" className="section-y">
      <div className="wrap">
        <h2 className={`${h2} max-w-[16ch]`} data-reveal>
          Why not just a cron job?
        </h2>
        {/* A real table on desktop; each row becomes a labelled stack on phones. */}
        <table data-reveal className="mt-[clamp(32px,4vw,56px)] block w-full text-[15px] md:table">
          <thead className="hidden md:table-header-group">
            <tr>
              <th />
              {columns.map((c, i) => (
                <th
                  key={c}
                  scope="col"
                  className={`pr-5 pb-[18px] text-left font-display text-lg font-semibold ${
                    i === 2 ? "text-accent italic" : "text-ink-2"
                  }`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="block md:table-row-group">
            {rows.map((r) => (
              <tr key={r.label} className="block border-t border-line py-[18px] md:table-row md:py-0">
                <th
                  scope="row"
                  className="mb-2.5 block text-left text-[15px] font-semibold md:mb-0 md:table-cell md:w-[18%] md:border-t md:border-line md:py-[18px] md:pr-5 md:align-top md:text-[13px] md:text-ink-3"
                >
                  {r.label}
                </th>
                {r.cells.map((cell, i) => (
                  <td
                    key={columns[i]}
                    className={`grid grid-cols-[8.5rem_1fr] gap-3 py-1 md:table-cell md:w-[27.33%] md:border-t md:border-line md:py-[18px] md:pr-5 md:align-top ${
                      i === 2 ? "font-semibold text-ink" : "text-ink-2"
                    }`}
                  >
                    <span className="text-[13px] font-medium text-ink-3 md:hidden">{columns[i]}</span>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line pt-7 pb-10 text-[13px] text-ink-3">
      <div className="wrap flex flex-wrap items-center justify-between gap-3">
        <Brand size="sm" />
        <span>Built for NEAR Hackathon 2026 · testnet only · not audited</span>
      </div>
    </footer>
  );
}
