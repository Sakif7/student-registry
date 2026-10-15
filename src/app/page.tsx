// Landing page. It becomes the "choose a view" screen once roles exist.
import { AppHeader } from "@/components/app-header";

export default function HomePage() {
  return (
    <>
      <AppHeader />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          Student Registry
        </h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          Enrolment, fees and payments, assessment submissions, and marks and
          results, for the Registry team and for students.
        </p>
      </main>
    </>
  );
}
