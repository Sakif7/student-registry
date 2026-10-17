"use client";

// Shown in place of a staff page that fails unexpectedly, inside the app.
import { PageError } from "@/components/page-error";

export default function StaffError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <PageError
      {...props}
      home={{ href: "/staff", label: "Go to the dashboard" }}
    />
  );
}
