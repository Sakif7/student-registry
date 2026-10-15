// Layout for the student view: navigation and who is viewing. Access is
// checked by each page and API call (see the staff layout for why).
import { Suspense } from "react";

import { AppHeader, type NavItem } from "@/components/app-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewerBadge } from "@/components/viewer-badge";

const STUDENT_NAV: readonly NavItem[] = [
  { href: "/student", label: "My record" },
  { href: "/student/assessments", label: "Assessments" },
];

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return (
    <>
      <AppHeader
        nav={STUDENT_NAV}
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
