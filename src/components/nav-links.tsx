"use client";

// Section navigation with the current page marked (aria-current). Reading the
// pathname suspends on pages with dynamic params, so the header renders
// <NavList> without a highlight as the Suspense fallback and swaps in
// <ActiveNavLinks> once the pathname is known.
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "./app-header";

/** The links, with `activeHref` (if any) marked as the current page. */
export function NavList({
  items,
  activeHref,
}: {
  items: readonly NavItem[];
  activeHref?: string;
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The links, with the one for the current page marked. */
export function ActiveNavLinks({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  // The longest matching prefix wins, so /staff/students/SMS-2026-0001 marks
  // "Students" rather than the "/staff" dashboard link.
  const active = items
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
  return <NavList items={items} activeHref={active?.href} />;
}
