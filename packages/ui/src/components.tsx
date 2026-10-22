import { cloneElement, isValidElement, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

type Tone = "primary" | "secondary" | "danger" | "ghost";
const tones: Record<Tone, string> = {
  primary: "bg-primary text-primary-fg shadow-sm hover:bg-primary-hover",
  secondary: "border border-line-strong bg-surface text-fg shadow-sm hover:bg-subtle",
  danger: "bg-danger text-danger-fg shadow-sm hover:opacity-90",
  ghost: "text-muted hover:bg-subtle hover:text-fg",
};

export function Button({ tone = "primary", size = "md", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: "sm" | "md" }) {
  return (
    <button
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

const fieldClass =
  "w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg shadow-xs transition-[border-color,box-shadow] focus:border-focus focus:outline-none focus:ring-4 focus:ring-focus/15 disabled:bg-subtle disabled:text-muted aria-invalid:border-danger";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldClass, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldClass, "min-h-20 py-2", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(fieldClass, "h-10 pr-8", className)} {...props} />;
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
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      {control}
      {note ? (
        <span id={`${id}-note`} className={cx("text-xs", error ? "text-danger" : "text-muted")}>
          {note}
        </span>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 text-sm text-fg">
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 rounded border-line-strong accent-[var(--accent)]" {...props} />
      <span>
        {label}
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

export function Card({ title, description, actions, children, className, flush }: { title?: string | undefined; description?: string | undefined; actions?: ReactNode; children: ReactNode; className?: string | undefined; flush?: boolean | undefined }) {
  const hasHeader = Boolean(title || actions);
  return (
    <section className={cx("min-w-0 rounded-xl border border-line bg-surface shadow-card", className)}>
      {hasHeader ? (
        <header className={cx("flex flex-wrap items-start justify-between gap-3 px-5 pt-5", flush ? "pb-4" : "pb-1")}>
          <div className="min-w-0">
            {title ? <h2 className="text-[15px] font-semibold text-fg">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={flush ? "" : cx("px-5 pb-5", hasHeader ? "pt-4" : "pt-5")}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, eyebrow, actions }: { title: string; subtitle?: string | undefined; eyebrow?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-sm text-muted">{eyebrow}</div> : null}
        <h1 className="text-2xl font-bold tracking-tight text-fg">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

type BadgeTone = "day" | "night" | "danger" | "neutral" | "accent";
const badgeTones: Record<BadgeTone, string> = {
  day: "bg-day-soft text-day",
  night: "bg-night-soft text-night",
  accent: "bg-accent-soft text-accent",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-subtle text-muted ring-1 ring-inset ring-line",
};

export function Badge({ tone = "neutral", dot, children }: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", badgeTones[tone])}>
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/** A table that sits flush inside a <Card flush>, scrolling sideways on its own when narrow. */
export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: string | false }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-y border-line bg-subtle">
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-5 py-2.5 text-xs font-semibold text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&>tr]:transition-colors [&>tr:hover]:bg-subtle/50">{children}</tbody>
      </table>
      {empty ? <p className="px-5 py-10 text-center text-sm text-muted">{empty}</p> : null}
    </div>
  );
}

export function Td({ children, className, colSpan }: { children: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cx("px-5 py-3 align-middle text-fg", className)}>
      {children}
    </td>
  );
}

export function Notice({ tone = "danger", children }: { tone?: "danger" | "success" | "warning"; children: ReactNode }) {
  const styles = { danger: "bg-danger-soft text-danger", success: "bg-night-soft text-night", warning: "bg-day-soft text-day" };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-sm font-medium", styles[tone])}>
      <Icon name={tone === "success" ? "check" : "alert"} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "day" | "night" }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center gap-2 text-sm text-muted">
        {tone ? <span aria-hidden className={cx("size-2 rounded-full", tone === "day" ? "bg-brand-day" : "bg-brand-night")} /> : null}
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-fg tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm font-semibold text-fg">{title}</p>
      {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("font-extrabold tracking-tight", className)}>
      intu<span className="text-brand-day">.</span>
    </span>
  );
}

// A small line-icon set (24px grid, 1.75 stroke) so the apps need no icon library.
const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  users: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.87M16 3.13a3.5 3.5 0 0 1 0 6.75",
  layers: "m12 3 9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5",
  store: "M3 9h18l-1.5-5h-15zM4 9v11h16V9M9 20v-6h6v6",
  shield: "M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6zM9 12l2 2 4-4",
  upload: "M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8",
  monitor: "M3 4h18v12H3zM8 20h8M12 16v4",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  plus: "M12 5v14M5 12h14",
  chevron: "m9 18 6-6-6-6",
  back: "m15 18-6-6 6-6",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0",
  check: "M20 6 9 17l-5-5",
  calendar: "M3 6h18v15H3zM16 3v6M8 3v6M3 10h18",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  eyeOff: "M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a17 17 0 0 1-3 4.2M6.6 6.6A17 17 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2",
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cx("size-5", className)}>
      <path d={ICONS[name]} />
    </svg>
  );
}
