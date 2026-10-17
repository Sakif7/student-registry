"use client";

// A form in a dialog: a button opens it, and the form closes it once it has
// saved. The form gets a `close` function to call when it is done, and ends
// with a FormDialogFooter.
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function FormDialog({
  label,
  title,
  description,
  variant = "outline",
  size = "default",
  disabled = false,
  wide = false,
  children,
}: {
  /** The button that opens the dialog. */
  label: ReactNode;
  title: string;
  description?: ReactNode;
  variant?: "default" | "outline";
  /** The opening button's size: "xs" in a table row, as row actions are. */
  size?: "default" | "sm" | "xs";
  disabled?: boolean;
  /** For longer forms. */
  wide?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant={variant} size={size} disabled={disabled} />}
      >
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

/**
 * The end of a form in a FormDialog: Cancel, which closes the dialog, then
 * the form's button, on the footer band that every dialog ends with. The form
 * must be a grid with a gap, as the dialog's own content is.
 */
export function FormDialogFooter({ children }: { children: ReactNode }) {
  return (
    <DialogFooter>
      <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
      {children}
    </DialogFooter>
  );
}
