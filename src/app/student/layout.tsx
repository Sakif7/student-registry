// Layout for the student pages: the app shell, with the student's pages in
// its sidebar.
import { AppShell } from "@/components/shell/app-shell";

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return <AppShell role="student">{children}</AppShell>;
}
