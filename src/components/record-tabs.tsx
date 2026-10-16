"use client";

// Tabs for a record page. Every tab's content arrives with the page, so
// switching is instant; the chosen tab goes into the address as ?tab=, so a
// link or a reload opens it again. Switching replaces the address rather
// than adding to the history, so Back leaves the record instead of stepping
// back through its tabs.
import type { ReactNode } from "react";
import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** A tab: its address value, its label, and what it shows. */
export interface RecordTab {
  value: string;
  label: string;
  content: ReactNode;
}

export function RecordTabs({
  tabs,
  initialTab,
}: {
  tabs: readonly RecordTab[];
  /** The ?tab= value the page was opened with, if any. */
  initialTab?: string;
}) {
  const first = tabs[0]?.value ?? "";
  const [tab, setTab] = useState(
    tabs.some(({ value }) => value === initialTab) ? initialTab : first,
  );

  function choose(value: string) {
    setTab(value);
    const url = new URL(window.location.href);
    if (value === first) url.searchParams.delete("tab");
    else url.searchParams.set("tab", value);
    // Next.js keeps its router in step with replaceState.
    window.history.replaceState(null, "", url);
  }

  return (
    <Tabs value={tab} onValueChange={(value: string) => choose(value)}>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList>
          {tabs.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map(({ value, content }) => (
        <TabsContent key={value} value={value} className="mt-6">
          {content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
