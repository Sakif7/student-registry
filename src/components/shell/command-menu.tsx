"use client";

// Search from anywhere, with Ctrl/⌘+K or the button in the top bar: every
// page, the main actions and, for staff, students by name, ID or email.
import { FilePlus2, Search, UserPlus, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { isSearchShortcut } from "@/lib/keyboard";
import { useHydrated } from "@/lib/use-hydrated";

import { type NavItem, navItems, type ShellRole } from "./nav";

/** A student found by the search. */
interface StudentHit {
  studentNumber: string;
  fullName: string;
}

const ACTIONS: Record<ShellRole, readonly NavItem[]> = {
  staff: [
    { href: "/staff/students/new", label: "Enrol a student", icon: UserPlus },
    {
      href: "/staff/assessments/new",
      label: "Set an assessment",
      icon: FilePlus2,
    },
  ],
  student: [],
};

/** Students shown at most, as the closest matches come first. */
const MAX_STUDENTS = 8;

export function CommandMenu({ role }: { role: ShellRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const students = useStudentSearch(role === "staff" && open ? query : "");
  // Like a form, unavailable until React can open it (and hear Ctrl/⌘+K).
  const hydrated = useHydrated();
  const isMac = useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => false,
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isSearchShortcut(event)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function go(href: string) {
    close();
    router.push(href);
  }

  const term = query.trim().toLowerCase();
  const matches = ({ label }: NavItem) => label.toLowerCase().includes(term);
  const pages = [
    ...navItems(role),
    { href: `/${role}/account`, label: "Your account", icon: UserRound },
  ].filter(matches);
  const actions = ACTIONS[role].filter(matches);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full max-w-64 justify-start font-normal text-muted-foreground"
        aria-disabled={hydrated ? undefined : true}
        onClick={() => setOpen(true)}
      >
        <Search />
        Search…
        {/* The shortcut means nothing on a phone, which has no keyboard. */}
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-xs text-foreground sm:inline">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={(value) => (value ? setOpen(true) : close())}
        title="Search"
        description={
          role === "staff"
            ? "Find a student, a page or an action."
            : "Find a page."
        }
      >
        {/* Filtering is done here, so students found by the server stay. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={
              role === "staff"
                ? "Search students, pages and actions…"
                : "Search pages…"
            }
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>Nothing matches “{query}”.</CommandEmpty>
            {students.length > 0 && (
              <CommandGroup heading="Students">
                {students.map((student) => (
                  <CommandItem
                    key={student.studentNumber}
                    value={student.studentNumber}
                    onSelect={() =>
                      go(`/staff/students/${student.studentNumber}`)
                    }
                  >
                    <UserRound />
                    {student.fullName}
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {student.studentNumber}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {pages.length > 0 && (
              <CommandGroup heading="Pages">
                {pages.map(({ href, label, icon: Icon }) => (
                  <CommandItem
                    key={href}
                    value={href}
                    onSelect={() => go(href)}
                  >
                    <Icon />
                    {label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {actions.length > 0 && (
              <CommandGroup heading="Actions">
                {actions.map(({ href, label, icon: Icon }) => (
                  <CommandItem
                    key={href}
                    value={href}
                    onSelect={() => go(href)}
                  >
                    <Icon />
                    {label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}

/**
 * Students matching the query, from the same search as the student list,
 * fetched a moment after typing stops. Fewer than two characters find none.
 * Results only show for the query they were found for: stale ones would let
 * Enter open a student the new query doesn't match.
 */
function useStudentSearch(query: string): StudentHit[] {
  const term = query.trim();
  const [found, setFound] = useState<{ term: string; items: StudentHit[] }>({
    term: "",
    items: [],
  });

  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/students?q=${encodeURIComponent(term)}`, {
        signal: controller.signal,
      })
        .then((response) =>
          response.ok
            ? (response.json() as Promise<{ items: StudentHit[] }>)
            : { items: [] },
        )
        .then(({ items }) =>
          setFound({ term, items: items.slice(0, MAX_STUDENTS) }),
        )
        // An aborted or failed search shows no students; pages still match.
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  return term.length >= 2 && found.term === term ? found.items : [];
}
