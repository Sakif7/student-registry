"use client";

// The academic year's fees as a ring: paid, overdue and not yet due, with the
// share collected in the middle. The legend beside it gives every figure in
// text, so the ring itself is hidden from screen readers.
import { cn } from "cn";
import { Label, Pie, PieChart } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { YearFees } from "@/domain/fees";
import { formatMoney } from "@/lib/format";

const PARTS = ["paid", "overdue", "notYetDue"] as const;
type Part = (typeof PARTS)[number];

const config = {
  paid: { label: "Paid", color: "var(--chart-paid)" },
  overdue: { label: "Overdue", color: "var(--chart-overdue)" },
  notYetDue: { label: "Not yet due", color: "var(--chart-due)" },
} satisfies ChartConfig;

const SWATCHES: Record<Part, string> = {
  paid: "bg-chart-paid",
  overdue: "bg-chart-overdue",
  notYetDue: "bg-chart-due",
};

export function FeesChart({ fees }: { fees: YearFees }) {
  const pence: Record<Part, number> = {
    paid: fees.paidPence,
    overdue: fees.overduePence,
    notYetDue: fees.notYetDuePence,
  };
  const data = PARTS.map((part) => ({
    part,
    pence: pence[part],
    fill: `var(--color-${part})`,
  }));
  // Rounded down: 99.6% isn't everything.
  const collected =
    fees.chargedPence > 0
      ? Math.floor((fees.paidPence / fees.chargedPence) * 100)
      : 0;

  return (
    // Side by side when the card is wide enough, the legend under the ring
    // when it isn't.
    <div className="@container">
      <div className="grid items-center gap-6 @sm:grid-cols-[11rem_1fr]">
        <ChartContainer
          config={config}
          aria-hidden
          className="mx-auto aspect-square w-full max-w-44"
        >
          <PieChart accessibilityLayer={false}>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  nameKey="part"
                  formatter={(value, name) => (
                    <div className="flex w-full justify-between gap-4">
                      <span className="text-muted-foreground">
                        {config[name as Part].label}
                      </span>
                      <span className="font-mono font-medium tabular-nums">
                        {formatMoney(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Pie
              data={data}
              dataKey="pence"
              nameKey="part"
              innerRadius="62%"
              // The card's colour, to part the segments: the chart styles hide
              // the default white.
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
              // Out of the tab order: the ring is hidden from screen readers,
              // and the legend gives its figures.
              rootTabIndex={-1}
            >
              <Label
                content={({ viewBox }) =>
                  viewBox && "cx" in viewBox && "cy" in viewBox ? (
                    <text
                      x={viewBox.cx}
                      y={viewBox.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      <tspan
                        x={viewBox.cx}
                        y={viewBox.cy}
                        className="fill-foreground text-2xl font-semibold"
                      >
                        {collected}%
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) + 22}
                        className="fill-muted-foreground text-xs"
                      >
                        collected
                      </tspan>
                    </text>
                  ) : null
                }
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <dl className="grid gap-3 text-sm">
          {PARTS.map((part) => (
            <div key={part} className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-2 whitespace-nowrap text-muted-foreground">
                <span
                  aria-hidden
                  className={cn("size-2.5 rounded-[3px]", SWATCHES[part])}
                />
                {config[part].label}
              </dt>
              <dd className="font-medium tabular-nums">
                {formatMoney(pence[part])}
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 border-t pt-3">
            <dt className="text-muted-foreground">Charged</dt>
            <dd className="font-semibold tabular-nums">
              {formatMoney(fees.chargedPence)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
