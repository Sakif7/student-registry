// The frame of every signed-in page: the sidebar, a top bar, and the page
// itself. Access is checked by each page and API call, not here: layouts
// don't re-run on client-side navigation, so a check here wouldn't protect
// the pages inside.
import { type ReactNode, Suspense } from "react";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

import { AppSidebar, type ShellRole } from "./app-sidebar";
import { UserMenu, UserMenuPlaceholder } from "./user-menu";

export function AppShell({
  role,
  children,
}: {
  role: ShellRole;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar
        role={role}
        user={
          <Suspense fallback={<UserMenuPlaceholder />}>
            <UserMenu />
          </Suspense>
        }
      />
      {/* The sidebar's inset, as a div: the top bar sits beside the main
          content rather than inside it. */}
      <div className="relative flex w-full min-w-0 flex-1 flex-col bg-background">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80">
          <SidebarTrigger className="-ml-1" />
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6"
        >
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
