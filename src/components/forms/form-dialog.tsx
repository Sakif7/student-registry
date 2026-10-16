"use client";

// A form in a dialog: a button opens it, and the form closes it once it has
// saved. The form gets a `close` function to call when it is done.
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function FormDialog({
  label,
  title,
  description,
  variant = "outline",
  disabled = false,
  wide = false,
  children,
}: {
  /** The button that opens the dialog. */
  label: ReactNode;
  title: string;
  description?: ReactNode;
  variant?: "default" | "outline";
  disabled?: boolean;
  /** For longer forms. */
  wide?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={variant} disabled={disabled} />}>
        {label}
      </DialogTrigger>
      <DialogContent className={wide ? "sm:max-w-xl" : undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children(() => setOpen(false))}
      </DialogContent>
    </Dialog>
  );
}
