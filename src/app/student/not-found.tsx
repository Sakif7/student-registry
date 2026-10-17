// Shown inside the student's pages when one can't find what it was asked
// for, such as an assessment that isn't one of theirs.
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";

export default function StudentNotFound() {
  return (
    <>
      <PageHeader
        title="Not found"
        description="There's nothing of yours at this address. The link may be mistyped, or point to something that isn't yours."
      />
      <div className="flex flex-wrap gap-2">
        <Link href="/student" className={buttonVariants()}>
          Go to your home page
        </Link>
      </div>
    </>
  );
}
