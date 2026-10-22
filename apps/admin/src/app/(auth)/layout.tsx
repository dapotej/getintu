import { Wordmark } from "@intu/ui";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <section className="relative hidden overflow-hidden bg-brand-ink p-12 text-brand-cream lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-brand-day/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-20 size-[28rem] rounded-full bg-brand-night/15 blur-3xl" />
        <Wordmark className="relative text-3xl" />
        <div className="relative max-w-md">
          <p className="text-3xl font-bold leading-tight tracking-tight">Day and night access to Lagos, run from one place.</p>
          <p className="mt-4 text-sm text-brand-cream/70">Members, plans, venues and payouts for the intu team. Every change is logged against your name.</p>
          <div className="mt-8 flex gap-6 text-xs font-medium text-brand-cream/70">
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-brand-day" /> Day: beaches, pools, golf, spas
            </span>
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-brand-night" /> Night: guest lists, hosted nights
            </span>
          </div>
        </div>
      </section>
      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark className="text-3xl" />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
