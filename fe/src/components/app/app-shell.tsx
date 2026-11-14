import type { ReactNode } from "react";
import { AppNav, type MobileBack } from "./app-nav";

/**
 * Frame for every dashboard page: fixed nav, content column, and room at the
 * bottom for the phone tab bar (or a page's own sticky action bar).
 */
export function AppShell({
  children,
  back,
  hideTabs = false,
}: {
  children: ReactNode;
  back?: MobileBack;
  hideTabs?: boolean;
}) {
  return (
    <>
      <AppNav back={back} hideTabs={hideTabs} />
      <main className="wrap pt-[88px] pb-[calc(104px+env(safe-area-inset-bottom))] md:pt-[120px] md:pb-24">
        {children}
      </main>
    </>
  );
}
