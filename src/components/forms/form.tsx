"use client";

// The form element for every form in the app. Pages stream their forms in
// server-rendered, and until React hydrates one, nothing handles its input:
// React Hook Form then fills each field with its default, replacing anything
// typed or chosen before. So the form is marked aria-disabled until it is
// hydrated. Assistive technology announces it as unavailable, and Playwright
// waits before typing into it.
import type { ComponentProps } from "react";

import { useHydrated } from "@/lib/use-hydrated";

export function Form(props: ComponentProps<"form">) {
  const hydrated = useHydrated();
  return <form aria-disabled={hydrated ? undefined : true} {...props} />;
}
