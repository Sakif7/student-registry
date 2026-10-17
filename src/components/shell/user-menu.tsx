// The signed-in person's menu at the foot of the sidebar, read from their
// session.
import { Skeleton } from "@/components/ui/skeleton";
import { currentSession } from "@/server/session";

import { UserMenuButton } from "./user-menu-button";

export async function UserMenu() {
  const session = await currentSession();
  if (!session) return null;
  return (
    <UserMenuButton
      name={session.name}
      detail={
        session.role === "staff" ? (
          "Registry staff"
        ) : (
          <span className="font-mono">{session.studentNumber}</span>
        )
      }
      accountHref={`/${session.role}/account`}
    />
  );
}

/**
 * Stands in for the menu while the session is read. Fixed sizes: shadcn's
 * menu skeleton picks a random width, which a prerender may not do.
 */
export function UserMenuPlaceholder() {
  return (
    <div className="flex h-12 items-center gap-2 px-2">
      <Skeleton className="size-8 shrink-0 rounded-lg" />
      <div className="grid flex-1 gap-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}
