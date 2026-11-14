"use client";

import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/landing/logo.svg";
import { routes } from "@/lib/routes";
import { logoClass, NavShell, useScrolled } from "../nav-shell";
import { WalletButton } from "../wallet/wallet-button";

const links = [
  { href: "#problem", label: "Problem" },
  { href: "#how", label: "How it Works" },
  { href: "#burn", label: "Hot Potato" },
  { href: "#compare", label: "Why Mashpit" },
];

/** Landing navbar: section links in the middle, "Open app" on the right. */
export function Nav() {
  const scrolled = useScrolled();

  return (
    <NavShell
      scrolled={scrolled}
      left={
        <Link href="#top" aria-label="Mashpit, back to top">
          <Image src={logo} alt="" unoptimized className={logoClass(scrolled)} />
        </Link>
      }
      center={
        <nav aria-label="Sections" className="contents">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-[15px] font-medium text-ink-2 transition-colors hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
      }
      right={
        <>
          <WalletButton compact />
          <Link
            href={routes.live}
            className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-bg transition-colors hover:bg-white sm:px-6"
          >
            Open app
          </Link>
        </>
      }
    />
  );
}
