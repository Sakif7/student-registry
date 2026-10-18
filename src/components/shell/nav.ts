// The pages of each section, in groups, for the sidebar and the search
// palette.
import {
  Banknote,
  BookOpen,
  CalendarDays,
  ChevronsUp,
  ClipboardList,
  GraduationCap,
  History,
  House,
  IdCard,
  LayoutDashboard,
  Library,
  type LucideIcon,
  Users,
} from "lucide-react";

/** Whose pages the shell shows. */
export type ShellRole = "staff" | "student";

/** A page in a section's navigation. */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** A group of pages under a heading in the sidebar. */
export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

export const NAV: Record<ShellRole, readonly NavGroup[]> = {
  staff: [
    {
      label: "Registry",
      items: [
        { href: "/staff", label: "Dashboard", icon: LayoutDashboard },
        { href: "/staff/students", label: "Students", icon: Users },
        {
          href: "/staff/assessments",
          label: "Assessments",
          icon: ClipboardList,
        },
        { href: "/staff/results", label: "Results", icon: GraduationCap },
        { href: "/staff/progression", label: "Progression", icon: ChevronsUp },
        { href: "/staff/activity", label: "Activity", icon: History },
      ],
    },
    {
      label: "Curriculum",
      items: [
        { href: "/staff/programmes", label: "Programmes", icon: Library },
        { href: "/staff/modules", label: "Modules", icon: BookOpen },
        {
          href: "/staff/academic-years",
          label: "Academic years",
          icon: CalendarDays,
        },
      ],
    },
  ],
  student: [
    {
      label: "Your studies",
      items: [
        { href: "/student", label: "Home", icon: House },
        { href: "/student/modules", label: "Modules", icon: BookOpen },
        {
          href: "/student/assessments",
          label: "Assessments",
          icon: ClipboardList,
        },
        { href: "/student/results", label: "Results", icon: GraduationCap },
        { href: "/student/fees", label: "Fees", icon: Banknote },
        { href: "/student/record", label: "My record", icon: IdCard },
      ],
    },
  ],
};

/** Every page of a section, whatever its group. */
export function navItems(role: ShellRole): readonly NavItem[] {
  return NAV[role].flatMap((group) => group.items);
}
