// A dashboard figure that links to the list it counts.
import Link from "next/link";

export function CountLink({
  href,
  label,
  count,
}: {
  href: string;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="block text-sm text-muted-foreground">{label}</span>
      <span className="block text-3xl font-semibold tabular-nums">{count}</span>
    </Link>
  );
}
