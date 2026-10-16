// The pages of each section, for the sidebar and the search palette.
import {
  Banknote,
  ClipboardList,
  GraduationCap,
  History,
  House,
  IdCard,
  LayoutDashboard,
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

export const NAV: Record<ShellRole, readonly NavItem[]> = {
  staff: [
    { href: "/staff", label: "Dashboard", icon: LayoutDashboard },
    { href: "/staff/students", label: "Students", icon: Users },
    { href: "/staff/assessments", label: "Assessments", icon: ClipboardList },
    { href: "/staff/results", label: "Results", icon: GraduationCap },
    { href: "/staff/activity", label: "Activity", icon: History },
  ],
  student: [
    { href: "/student", label: "Home", icon: House },
    { href: "/student/assessments", label: "Assessments", icon: ClipboardList },
    { href: "/student/results", label: "Results", icon: GraduationCap },
    { href: "/student/fees", label: "Fees", icon: Banknote },
    { href: "/student/record", label: "My record", icon: IdCard },
  ],
};
