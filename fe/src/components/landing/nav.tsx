import { routes } from "@/lib/routes";
import { Brand } from "./brand";
import { ButtonLink } from "./button";

const links = [
  { href: "#problem", label: "Problem" },
  { href: "#how", label: "How it works" },
  { href: "#burn", label: "Hot potato" },
  { href: "#compare", label: "vs. cron" },
];

// Fixed, and rendered outside the ScrollSmoother wrapper: anything inside the
// smoothed content is moved with transforms, which breaks position: fixed.
export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-bg/95">
      <div className="wrap flex h-[72px] items-center justify-between gap-4">
        <Brand />
        <nav
          aria-label="Sections"
          className="hidden gap-1 rounded-full border border-line bg-surface p-1 md:flex"
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
        <ButtonLink href={routes.live} size="sm">
          Open live arena
        </ButtonLink>
      </div>
    </header>
  );
}
