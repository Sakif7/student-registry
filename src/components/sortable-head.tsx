// A column heading that sorts its table: a link that sorts by the column, or
// reverses the order when the table is already sorted by it. The heading
// announces the order (aria-sort), and an arrow shows it.
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";

import { TableHead } from "@/components/ui/table";

export function SortableHead({
  label,
  href,
  direction,
  className,
}: {
  label: string;
  /** Where the link goes: the list sorted by this column. */
  href: string;
  /** How the table is sorted by this column now, if it is. */
  direction?: "asc" | "desc";
  className?: string;
}) {
  const Arrow =
    direction === "asc"
      ? ArrowUp
      : direction === "desc"
        ? ArrowDown
        : ArrowUpDown;
  return (
    <TableHead
      aria-sort={
        direction === "asc"
          ? "ascending"
          : direction === "desc"
            ? "descending"
            : undefined
      }
      className={className}
    >
      <Link
        href={href}
        scroll={false}
        className="inline-flex items-center gap-1 rounded-sm hover:text-foreground"
      >
        {label}
        <Arrow
          aria-hidden
          className={direction ? "size-3.5" : "size-3.5 opacity-40"}
        />
      </Link>
    </TableHead>
  );
}
