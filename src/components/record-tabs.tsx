"use client";

// Tabs for a record page. Every tab's content arrives with the page, so
// switching is instant; the chosen tab goes into the address as ?tab=, so a
// link or a reload opens it again. Switching replaces the address rather
// than adding to the history, so Back leaves the record instead of stepping
// back through its tabs. A summary above the tabs can open them too, through
// RecordTabLink.
import type { MouseEvent, ReactNode } from "react";
import { createContext, use, useEffect, useRef, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** A tab: its address value, its label, and what it shows. */
export interface RecordTab {
  value: string;
  label: string;
  content: ReactNode;
}

/** Opens a tab from outside the tab list, for RecordTabLink. */
const OpenTab = createContext<((value: string) => void) | null>(null);

export function RecordTabs({
  tabs,
  initialTab,
  header,
}: {
  tabs: readonly RecordTab[];
  /** The ?tab= value the page was opened with, if any. */
  initialTab?: string;
  /** Shown above the tabs, e.g. a summary whose facts open them. */
  header?: ReactNode;
}) {
  const first = tabs[0]?.value ?? "";
  const [tab, setTab] = useState(
    tabs.some(({ value }) => value === initialTab) ? initialTab : first,
  );
  const tabList = useRef<HTMLDivElement>(null);

  function choose(value: string) {
    setTab(value);
    const url = new URL(window.location.href);
    if (value === first) url.searchParams.delete("tab");
    else url.searchParams.set("tab", value);
    // Next.js keeps its router in step with replaceState.
    window.history.replaceState(null, "", url);
  }

  /** Opens a tab and moves focus to it, so the reader knows where they are. */
  function open(value: string) {
    choose(value);
    tabList.current
      ?.querySelector<HTMLElement>(`[data-tab="${value}"]`)
      ?.focus();
  }

  // On a phone the tabs scroll sideways. The open one is brought into view,
  // as when the page opens on ?tab=history; only the tabs scroll, not the
  // page.
  useEffect(() => {
    const list = tabList.current;
    const trigger = list?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
    if (!list || !trigger) return;
    const start =
      trigger.getBoundingClientRect().left -
      list.getBoundingClientRect().left +
      list.scrollLeft;
    list.scrollLeft = start - (list.clientWidth - trigger.offsetWidth) / 2;
  }, [tab]);

  return (
    <OpenTab value={open}>
      {header && <div className="mb-6">{header}</div>}
      <Tabs value={tab} onValueChange={(value: string) => choose(value)}>
        {/* Fades at an edge with more tabs beyond it, as a table does. */}
        <div
          ref={tabList}
          className="-mx-1 scroll-fade-x overflow-x-auto px-1 pb-1 not-supports-[animation-timeline:scroll()]:scroll-fade-none"
        >
          <TabsList>
            {tabs.map(({ value, label }) => (
              <TabsTrigger key={value} value={value} data-tab={value}>
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
    </OpenTab>
  );
}

/**
 * A link to one of the record's tabs, from the header of RecordTabs: it
 * opens the tab in place. Opened in a new window, or before the page is
 * interactive, it loads the record on that tab instead.
 */
export function RecordTabLink({
  tab,
  className,
  children,
}: {
  tab: string;
  className?: string;
  children: ReactNode;
}) {
  const open = use(OpenTab);

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    const newWindow =
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey;
    if (!open || newWindow) return;
    event.preventDefault();
    open(tab);
  }

  return (
    <a href={`?tab=${tab}`} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
