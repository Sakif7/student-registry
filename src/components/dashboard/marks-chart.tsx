"use client";

// The academic year's marks by classification, as columns labelled with
// their counts. A list with the same figures stands in for the chart for
// screen readers.
import { Bar, BarChart, CartesianGrid, LabelList, XAxis } from "recharts";

import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import {
  type Classification,
  CLASSIFICATION_LABELS,
  CLASSIFICATIONS,
} from "@/domain/results";

const config = {
  marks: { label: "Marks", color: "var(--chart-primary)" },
} satisfies ChartConfig;

export function MarksChart({
  marks,
}: {
  marks: Record<Classification, number>;
}) {
  const data = CLASSIFICATIONS.map((classification) => ({
    classification: CLASSIFICATION_LABELS[classification],
    marks: marks[classification],
  }));
  return (
    <>
      <ChartContainer
        config={config}
        aria-hidden
        className="aspect-auto h-56 w-full"
      >
        <BarChart data={data} margin={{ top: 24 }} accessibilityLayer={false}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="classification"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <Bar
            dataKey="marks"
            fill="var(--color-marks)"
            radius={6}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="marks"
              position="top"
              offset={8}
              className="fill-foreground"
              fontSize={12}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
      <ul className="sr-only">
        {data.map(({ classification, marks: count }) => (
          <li key={classification}>
            {classification}: {count === 1 ? "1 mark" : `${count} marks`}
          </li>
        ))}
      </ul>
    </>
  );
}
