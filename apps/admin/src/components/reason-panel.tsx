"use client";
import { Button, Field, SidePanel, Textarea } from "@intu/ui";
import { ActionForm, text } from "@/components/forms";

/** A button for an action that needs a reason for the audit log; the reason is asked for in a side panel. */
export function ReasonPanel({
  button,
  title,
  description,
  confirm,
  hint = "Kept in the audit log.",
  danger = false,
  onConfirm,
}: {
  button: string;
  title: string;
  description?: string | undefined;
  confirm: string;
  hint?: string;
  danger?: boolean;
  onConfirm: (reason: string) => Promise<unknown>;
}) {
  return (
    <SidePanel
      title={title}
      description={description}
      trigger={(open) => (
        <Button size="sm" tone="ghost" onClick={open}>
          {button}
        </Button>
      )}
    >
      {(close) => (
        <ActionForm
          action={async (form) => {
            await onConfirm(text(form, "reason"));
            close();
          }}
        >
          {(busy) => (
            <>
              <Field label="Reason" hint={hint}>
                <Textarea name="reason" required minLength={3} />
              </Field>
              <Button type="submit" tone={danger ? "danger" : "primary"} disabled={busy}>
                {confirm}
              </Button>
            </>
          )}
        </ActionForm>
      )}
    </SidePanel>
  );
}
