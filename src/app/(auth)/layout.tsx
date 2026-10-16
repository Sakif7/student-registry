// Layout for the signed-out pages (sign in, forgot password, set a password):
// the product name above a single centred column.
import type { ReactNode } from "react";

export default function SignedOutLayout({ children }: { children: ReactNode }) {
  return (
    <main
      id="main"
      className="flex flex-1 flex-col items-center px-4 py-12 sm:py-20"
    >
      <p className="mb-8 text-lg font-semibold tracking-tight">
        Student Registry
      </p>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
