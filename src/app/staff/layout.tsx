// Layout for the Registry staff pages: the app shell, with the staff pages
// in its sidebar.
import { AppShell } from "@/components/shell/app-shell";

export default function StaffLayout({ children }: LayoutProps<"/staff">) {
  return <AppShell role="staff">{children}</AppShell>;
}
