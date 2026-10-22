"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./components.tsx";

/**
 * Where every form that adds or edits something opens: a panel over the page from the right
 * (the whole screen on a phone). It closes with Esc, the close button or a click outside, and
 * starts fresh each time it opens.
 */
export function SidePanel({
  trigger,
  title,
  description,
  children,
}: {
  trigger: (open: () => void) => ReactNode;
  title: string;
  description?: string | undefined;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = () => setOpen(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      {trigger(() => setOpen(true))}
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={close}
        // The backdrop belongs to the dialog element itself; the panel's content covers the rest.
        onClick={(e) => e.target === e.currentTarget && close()}
        className="m-0 ml-auto h-dvh max-h-none w-full max-w-md bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/50 sm:border-l sm:border-line"
      >
        {open ? (
          <div className="flex h-full flex-col">
            <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-lg font-semibold text-fg">
                  {title}
                </h2>
                {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
              </div>
              <button type="button" aria-label="Close" onClick={close} className="-mr-1.5 shrink-0 rounded-md p-1.5 text-muted hover:bg-subtle hover:text-fg">
                <Icon name="close" className="size-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-5">{children(close)}</div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
