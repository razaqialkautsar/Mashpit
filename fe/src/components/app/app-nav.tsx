"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Plus, Radio, Users, type LucideIcon } from "lucide-react";
import logo from "@/assets/landing/logo.svg";
import { getStats } from "@/lib/contract";
import { formatInt } from "@/lib/format";
import { near } from "@/lib/near";
import { routes } from "@/lib/routes";
import { usePoll } from "@/hooks/use-poll";
import { logoClass, NavShell, useScrolled } from "../nav-shell";
import { WalletButton } from "../wallet/wallet-button";

const links: { href: string; label: string; icon: LucideIcon }[] = [
  { href: routes.live, label: "Live", icon: Radio },
  { href: routes.keepers, label: "Keepers", icon: Users },
  { href: routes.newJob, label: "New job", icon: Plus },
];

// /job?id=… belongs to the Live section.
const isActive = (path: string, href: string) =>
  path === href || (href === routes.live && path.startsWith(routes.job));

/** `withId` appends "#<id>" from the ?id= query string (detail pages). */
export type MobileBack = { href: string; label: string; withId?: boolean };

function BackLabel({ label }: { label: string }) {
  const id = useSearchParams().get("id");
  return <>{id && /^\d+$/.test(id) ? `${label} #${id}` : label}</>;
}

/** Network and current block. Fixed width, so nothing shifts when the block arrives. */
function NetworkChip() {
  const { data: stats } = usePoll(getStats);
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line-strong px-3 py-2 text-[13px] font-semibold md:px-4">
      <span aria-hidden="true" className="size-2 rounded-full bg-ok md:hidden" />
      {near.network}
      <span aria-hidden="true" className="hidden h-3.5 w-px bg-line-strong md:block" />
      {/* 13ch holds "#277,636,783" in the mono face; the dash keeps that width while loading. */}
      <span title="Current block" className="hidden w-[13ch] font-mono text-xs font-medium text-ink-2 tabular-nums md:inline-block">
        #{stats ? formatInt(stats.current_block) : "—"}
      </span>
    </span>
  );
}

/**
 * Dashboard navbar: the same frame and scroll behaviour as the landing one
 * (see NavShell), with the dashboard links in the middle. Phones get a tab
 * bar along the bottom instead, and detail pages swap the logo for a back button.
 */
export function AppNav({ back, hideTabs = false }: { back?: MobileBack; hideTabs?: boolean }) {
  const path = usePathname().replace(/\/$/, "") || "/";
  const scrolled = useScrolled();

  const home = (
    <Link href="/" aria-label="Mashpit home" className={back ? "hidden md:block" : ""}>
      <Image src={logo} alt="" unoptimized className={logoClass(scrolled)} />
    </Link>
  );

  return (
    <>
      <NavShell
        scrolled={scrolled}
        left={
          <>
            {home}
            {back && (
              <Link href={back.href} className="flex items-center gap-3 md:hidden">
                <span className="grid size-10 place-items-center rounded-full border border-line-strong">
                  <ArrowLeft aria-hidden="true" className="size-4" />
                </span>
                <span className="font-display text-lg">
                  {back.withId ? (
                    <Suspense fallback={back.label}>
                      <BackLabel label={back.label} />
                    </Suspense>
                  ) : (
                    back.label
                  )}
                </span>
              </Link>
            )}
          </>
        }
        center={
          <nav aria-label="Dashboard" className="contents">
            {links.map(({ href, label }) => {
              const active = isActive(path, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative text-[15px] font-medium transition-colors ${active ? "text-ink" : "text-ink-2 hover:text-ink"}`}
                >
                  {label}
                  {/* Active page: a small accent dot under the label. */}
                  <span
                    aria-hidden="true"
                    className={`absolute -bottom-2.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-accent transition-opacity ${active ? "opacity-100" : "opacity-0"}`}
                  />
                </Link>
              );
            })}
          </nav>
        }
        right={
          <>
            <NetworkChip />
            <WalletButton className="hidden md:inline-flex" />
            <WalletButton compact className="md:hidden" />
          </>
        }
      />

      {!hideTabs && (
        <nav
          aria-label="Dashboard"
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        >
          {links.map(({ href, label, icon: Icon }) => {
            const active = isActive(path, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 pt-3 pb-3.5 text-xs font-semibold ${active ? "text-accent" : "text-ink-2"}`}
              >
                <Icon aria-hidden="true" className="size-5" />
                {label}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
