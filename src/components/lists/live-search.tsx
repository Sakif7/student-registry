"use client";

// A search box that filters its list as you type. A moment after typing
// stops, the text goes into the address (?q=…), so the server does the
// searching and a filtered view can still be bookmarked or shared. Typing
// replaces the address rather than adding to the history, so Back leaves the
// list instead of stepping back a letter at a time. Inside the list's form,
// Enter searches at once.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** How long typing has to pause before the list follows. */
const PAUSE_MS = 300;

export function LiveSearch({
  label = "Search",
  placeholder,
  param = "q",
  pageParam = "page",
  className,
  inputClassName,
}: {
  label?: string;
  placeholder: string;
  /** The search's name in the address. */
  param?: string;
  /** The page number to drop when the search changes, back to page 1. */
  pageParam?: string;
  className?: string;
  inputClassName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const applied = searchParams.get(param) ?? "";
  const [value, setValue] = useState(applied);
  const [typing, setTyping] = useState(false);
  const [, startTransition] = useTransition();
  // Unique to this instance, as hidden pages stay in the document.
  const id = `${useId()}${param}`;

  // Follow the address when it changes while nobody is typing here: Back,
  // or "Clear filters".
  const [seen, setSeen] = useState(applied);
  if (applied !== seen) {
    setSeen(applied);
    if (!typing) setValue(applied);
  }

  useEffect(() => {
    const text = value.trim();
    if (text === applied.trim()) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (text) params.set(param, text);
      else params.delete(param);
      params.delete(pageParam);
      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    }, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [value, applied, param, pageParam, pathname, router, searchParams]);

  return (
    <div className={className ?? "grid w-full gap-1.5 sm:w-auto"}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={param}
        type="search"
        maxLength={100}
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.currentTarget.value)}
        onFocus={() => setTyping(true)}
        onBlur={() => setTyping(false)}
        className={inputClassName ?? "min-w-0 sm:w-64"}
      />
    </div>
  );
}
