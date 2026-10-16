"use client";

// The sidebar beside every signed-in page: the product, the section's pages
// with the current one marked, and who is signed in. It collapses to icons on
// a desktop (Ctrl/⌘+B), and slides in from the left on a phone.
import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

import { NAV, type NavGroup, type ShellRole } from "./nav";

export function AppSidebar({
  role,
  user,
}: {
  role: ShellRole;
  /** Who is signed in, with their menu, for the foot of the sidebar. */
  user: ReactNode;
}) {
  const groups = NAV[role];
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href={`/${role}`} />}>
              <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <GraduationCap className="size-4" />
              </span>
              <span className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Student Registry</span>
                <span className="truncate text-xs text-muted-foreground">
                  {role === "staff" ? "Registry staff" : "Student portal"}
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main">
          {/* Reading the path suspends on pages with dynamic params, so
              the links show unmarked until it is known. */}
          <Suspense fallback={<NavGroups groups={groups} />}>
            <ActiveNavGroups groups={groups} />
          </Suspense>
        </nav>
      </SidebarContent>
      <SidebarFooter>{user}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function ActiveNavGroups({ groups }: { groups: readonly NavGroup[] }) {
  const pathname = usePathname();
  // The longest matching prefix wins, so /staff/students/SMS-2026-0001 marks
  // "Students" rather than the "/staff" dashboard.
  const active = groups
    .flatMap((group) => group.items)
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
  return <NavGroups groups={groups} activeHref={active?.href} />;
}

function NavGroups({
  groups,
  activeHref,
}: {
  groups: readonly NavGroup[];
  activeHref?: string;
}) {
  return groups.map((group) => (
    <SidebarGroup key={group.label}>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <NavMenu group={group} activeHref={activeHref} />
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}

function NavMenu({
  group,
  activeHref,
}: {
  group: NavGroup;
  activeHref?: string;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {group.items.map(({ href, label, icon: Icon }) => {
        const active = href === activeHref;
        return (
          <SidebarMenuItem key={href}>
            <SidebarMenuButton
              isActive={active}
              tooltip={label}
              render={
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpenMobile(false)}
                />
              }
            >
              <Icon />
              <span>{label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
