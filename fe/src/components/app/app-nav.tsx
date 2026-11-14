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

export function AppNav({ back, hideTabs = false }: { back?: MobileBack; hideTabs?: boolean }) {
  const path = usePathname().replace(/\/$/, "") || "/";
  const { data: stats } = usePoll(getStats);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="wrap flex h-16 items-center justify-between gap-3 md:h-[76px]">
          {/* Phones on a detail page swap the logo for a back button + title. */}
          {back ? (
            <>
              <Link href="/" aria-label="Mashpit home" className="hidden md:block">
                <Image src={logo} alt="" className="h-7 w-auto" unoptimized />
              </Link>
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
            </>
          ) : (
            <Link href="/" aria-label="Mashpit home">
              <Image src={logo} alt="" className="h-7 w-auto" unoptimized />
            </Link>
          )}

          <nav aria-label="Dashboard" className="hidden gap-1 rounded-full border border-line-strong bg-surface p-1 md:flex">
            {links.map(({ href, label, icon: Icon }) => {
              const active = isActive(path, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    active ? "bg-surface-3 text-ink" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  <Icon aria-hidden="true" className={`size-4 ${active ? "text-accent" : ""}`} />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-line-strong px-3 py-2 text-[13px] font-semibold md:px-4">
              <span aria-hidden="true" className="size-2 rounded-full bg-ok md:hidden" />
              {near.network}
              <span aria-hidden="true" className="hidden h-3.5 w-px bg-line-strong md:block" />
              <span className="hidden font-mono text-xs font-medium text-ink-2 tabular-nums md:inline" title="Current block">
                #{stats ? formatInt(stats.current_block) : "—"}
              </span>
            </span>
            <WalletButton className="hidden md:inline-flex" />
            <WalletButton compact className="md:hidden" />
          </div>
        </div>
      </header>

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
