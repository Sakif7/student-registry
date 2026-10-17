"use client";

// Shown in place of a student page that fails unexpectedly, inside the app.
import { PageError } from "@/components/page-error";

export default function StudentError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <PageError {...props} home={{ href: "/student", label: "Go to Home" }} />
  );
}
