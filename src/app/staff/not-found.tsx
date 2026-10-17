// Shown inside the staff pages when one can't find what it was asked for,
// such as a student ID that isn't on file or an assessment that was never set.
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";

export default function StaffNotFound() {
  return (
    <>
      <PageHeader
        title="Not found"
        description="Nothing is filed under this address. The link may be mistyped, or point to something that was never set up."
      />
      <div className="flex flex-wrap gap-2">
        <Link href="/staff" className={buttonVariants()}>
          Go to the dashboard
        </Link>
        <Link
          href="/staff/students"
          className={buttonVariants({ variant: "outline" })}
        >
          Find a student
        </Link>
      </div>
    </>
  );
}
