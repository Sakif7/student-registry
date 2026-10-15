// Layout for the Registry staff view: navigation and who is viewing. Access is
// checked by each page and API call, not here: layouts don't re-run on
// client-side navigation, so a check here would not protect child pages.
import { Suspense } from "react";

import { AppHeader, type NavItem } from "@/components/app-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewerBadge } from "@/components/viewer-badge";

const STAFF_NAV: readonly NavItem[] = [{ href: "/staff", label: "Dashboard" }];

export default function StaffLayout({ children }: LayoutProps<"/staff">) {
  return (
    <>
      <AppHeader
        nav={STAFF_NAV}
        aside={
          <Suspense fallback={<Skeleton className="h-5 w-56" />}>
            <ViewerBadge />
          </Suspense>
        }
      />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
    </>
  );
}
