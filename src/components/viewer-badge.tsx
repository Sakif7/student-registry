// Shows who is viewing the registry, with a link back to the role picker.
import Link from "next/link";

import { describeViewer } from "@/server/services/viewers";
import { currentSession } from "@/server/session";

export async function ViewerBadge() {
  const session = await currentSession();
  const viewer = session ? await describeViewer(session) : null;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-muted-foreground">
        Viewing as{" "}
        <span className="font-medium text-foreground">
          {viewer ?? "no one"}
        </span>
      </span>
      <Link href="/" className="font-medium underline-offset-4 hover:underline">
        Switch view
      </Link>
    </span>
  );
}
