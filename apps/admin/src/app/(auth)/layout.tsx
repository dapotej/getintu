import { Wordmark } from "@intu/ui";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Wordmark className="text-4xl" />
          <p className="mt-2 text-sm text-cream-muted">Admin console</p>
        </div>
        <div className="rounded-2xl border border-ink-line bg-ink-raised p-6">{children}</div>
      </div>
    </main>
  );
}
