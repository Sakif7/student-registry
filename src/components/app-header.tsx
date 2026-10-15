// Page header shared by every section: the product name, the section's
// navigation, and an optional slot on the right (e.g. who is viewing).
import Link from "next/link";
import type { ReactNode } from "react";

/** A link in the section navigation. */
export interface NavItem {
  href: string;
  label: string;
}

/**
 * Renders the top bar of a section.
 *
 * @param nav - Links for the current section; omitted on the landing page.
 * @param aside - Content shown at the right-hand end, such as the viewer.
 */
export function AppHeader({
  nav = [],
  aside,
}: {
  nav?: readonly NavItem[];
  aside?: ReactNode;
}) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
        <Link href="/" className="font-semibold tracking-tight">
          Student Registry
        </Link>
        {nav.length > 0 && (
          <nav aria-label="Main">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {aside && <div className="ml-auto text-sm">{aside}</div>}
      </div>
    </header>
  );
}
