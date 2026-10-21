import { cloneElement, isValidElement, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

type Tone = "primary" | "secondary" | "danger" | "ghost";
const tones: Record<Tone, string> = {
  primary: "bg-night text-ink hover:bg-night/90",
  secondary: "border border-ink-line bg-ink-raised text-cream hover:border-cream-muted",
  danger: "bg-pop text-ink hover:bg-pop/90",
  ghost: "text-cream-muted hover:text-cream",
};

export function Button({ tone = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      className={cx("inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50", tones[tone], className)}
      {...props}
    />
  );
}

const fieldClass = "w-full rounded-lg border border-ink-line bg-ink px-3 py-2 text-sm text-cream placeholder:text-cream-muted/60 focus:border-night focus:outline-none";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldClass, "min-h-20", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(fieldClass, className)} {...props} />;
}

/**
 * A labelled form control. The label and hint are linked to the control by id, so screen readers
 * announce just the label as its name and the hint or error as its description.
 */
export function Field({ label, hint, error, children }: { label: string; hint?: string | undefined; error?: string | undefined; children: ReactNode }) {
  const id = useId();
  const note = error ?? hint;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>, { id, ...(note ? { "aria-describedby": `${id}-note` } : {}), ...(error ? { "aria-invalid": true } : {}) })
    : children;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wide text-cream-muted">
        {label}
      </label>
      {control}
      {note ? (
        <span id={`${id}-note`} className={cx("block text-xs", error ? "text-pop" : "text-cream-muted")}>
          {note}
        </span>
      ) : null}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-2xl border border-ink-line bg-ink-raised p-5", className)}>
      {title || actions ? (
        <header className="mb-4 flex items-center justify-between gap-4">
          {title ? <h2 className="text-base font-bold">{title}</h2> : <span />}
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string | undefined; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-cream-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

type BadgeTone = "day" | "night" | "pop" | "muted";
const badgeTones: Record<BadgeTone, string> = {
  day: "bg-day/15 text-day",
  night: "bg-night/15 text-night",
  pop: "bg-pop/15 text-pop",
  muted: "bg-cream/10 text-cream-muted",
};

export function Badge({ tone = "muted", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", badgeTones[tone])}>{children}</span>;
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: string | false }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ink-line text-xs uppercase tracking-wide text-cream-muted">
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-line">{children}</tbody>
      </table>
      {empty ? <p className="px-3 py-6 text-center text-sm text-cream-muted">{empty}</p> : null}
    </div>
  );
}

export function Td({ children, className, colSpan }: { children: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cx("px-3 py-2 align-top", className)}>
      {children}
    </td>
  );
}

export function Notice({ tone = "pop", children }: { tone?: "pop" | "night" | "day"; children: ReactNode }) {
  const styles = { pop: "border-pop/40 bg-pop/10 text-pop", night: "border-night/40 bg-night/10 text-night", day: "border-day/40 bg-day/10 text-day" };
  return (
    <div role={tone === "pop" ? "alert" : "status"} className={cx("rounded-lg border px-4 py-3 text-sm", styles[tone])}>
      {children}
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("font-extrabold tracking-tight", className)}>
      intu<span className="text-day">.</span>
    </span>
  );
}
