"use client";

import { useEffect, useState } from "react";
import { routes } from "@/lib/routes";
import { Brand } from "./brand";
import { WalletButton } from "../wallet/wallet-button";
import { ButtonLink } from "./button";

const links = [
  { href: "#problem", label: "Problem" },
  { href: "#how", label: "How it works" },
  { href: "#burn", label: "Hot potato" },
  { href: "#compare", label: "vs. cron" },
];

// Fixed, and rendered outside the ScrollSmoother wrapper: anything inside the
// smoothed content is moved with transforms, which breaks position: fixed.
// Transparent over the hero so it reads as part of the scene; it gains a
// backdrop once the page scrolls so it stays legible over every section.
export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // React skips the re-render when the boolean is unchanged, so this is cheap.
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color] duration-300 ${
        scrolled ? "border-line bg-bg" : "border-transparent bg-transparent"
      }`}
    >
      <div className="wrap flex h-[72px] items-center justify-between gap-4">
        <Brand />
        <nav
          aria-label="Sections"
          className="hidden gap-1 rounded-full border border-white/10 bg-bg/40 p-1 md:flex"
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-4 py-2 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {/* Outline, so the hero CTA stays the one filled button on screen. */}
          <ButtonLink href={routes.live} size="sm" variant="ghost" className="hidden sm:inline-flex">
            Open live arena
          </ButtonLink>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
