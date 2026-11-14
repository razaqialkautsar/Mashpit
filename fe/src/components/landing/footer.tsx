import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/landing/logo.svg";
import { accountUrl, near } from "@/lib/near";
import { routes } from "@/lib/routes";
import { Reveal } from "./motion";

const REPO = "https://github.com/razaqialkautsar/Mashpit";

type FooterLink = { label: string; href: string };

const columns: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Live arena", href: routes.live },
      { label: "Keepers", href: routes.keepers },
      { label: "Post a job", href: routes.newJob },
      { label: "How it works", href: "#how" },
      { label: "Hot potato", href: "#burn" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "GitHub", href: REPO },
      { label: "README", href: `${REPO}#readme` },
      { label: "Keeper setup", href: `${REPO}/tree/main/keeper#readme` },
      { label: "Contract", href: `${REPO}/tree/main/contracts/mashpit#readme` },
      { label: "On NearBlocks", href: accountUrl(near.contractId) },
    ],
  },
  {
    title: "Built on",
    links: [
      { label: "NEAR", href: "https://near.org" },
      { label: "NEAR AI Cloud", href: "https://cloud.near.ai" },
      { label: "NEAR Connect", href: "https://docs.near.org/tools/near-connect" },
    ],
  },
];

const external = (href: string) => /^https?:/.test(href);

// Full-strength ink only: accent-ink on accent is ~5:1, but any transparency
// drops below 4.5:1. Hover is an underline, and the amber focus ring would
// vanish on orange, so focus uses the ink too.
const link =
  "text-[15px] font-medium underline-offset-4 hover:underline focus-visible:outline-accent-ink";

/** Solid orange closing band: brand on the left, links on the right. */
export function Footer() {
  return (
    // The site-wide ::selection is orange too; invert it here so selected text stays visible.
    <footer className="bg-accent text-accent-ink selection:bg-accent-ink selection:text-accent">
      <div className="wrap grid gap-x-10 gap-y-12 pt-[clamp(56px,8vw,104px)] pb-10 lg:grid-cols-[1fr_auto]">
        <Reveal distance={20}>
          <Link
            href="#top"
            aria-label="Mashpit, back to top"
            className="inline-flex items-center gap-4 font-display text-[clamp(3rem,6.5vw,5.5rem)] leading-none font-semibold italic focus-visible:outline-accent-ink"
          >
            {/* The logo is orange; brightness(0) turns it into the same ink as the text. */}
            <Image src={logo} alt="" unoptimized className="h-[0.864em] w-auto brightness-0" />
            Mashpit
          </Link>
          <p className="mt-4 max-w-[34ch] text-base font-medium sm:text-[17px]">
            The keeper market for NEAR. You pay only when the call succeeds.
          </p>
        </Reveal>

        <Reveal stagger={0.08} distance={20} className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:gap-x-16">
          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title} className={col.title === "Built on" ? "col-span-2 sm:col-span-1" : ""}>
              <h2 className="font-sans text-[15px] font-bold tracking-normal">{col.title}</h2>
              <ul className="mt-4 grid gap-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {external(l.href) ? (
                      <a href={l.href} target="_blank" rel="noreferrer" className={link}>
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className={link}>
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </Reveal>

        <p className="border-t border-accent-ink/20 pt-6 text-center text-sm font-medium lg:col-span-2">
          © 2026 Mashpit · Built for the NEAR Hackathon · testnet only, not audited
        </p>
      </div>
    </footer>
  );
}
