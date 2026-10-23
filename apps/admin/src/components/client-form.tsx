"use client";
// A client account's details, for adding one and editing it.
import { Button, Checkbox, Field, Input, Select, Textarea } from "@intu/ui";
import { ActionForm, checked, intOrNull, text, textOrNull } from "@/components/forms";
import type { Client } from "@/lib/types";

export const CLIENT_KINDS: Record<Client["kind"], string> = { bank: "Bank or fintech", employer: "Employer", promoter: "Promoter or hotel" };

const readClient = (form: FormData) => ({
  name: text(form, "name"),
  kind: text(form, "kind"),
  contractRef: textOrNull(form, "contractRef"),
  contractStartsOn: textOrNull(form, "contractStartsOn"),
  contractEndsOn: textOrNull(form, "contractEndsOn"),
  seats: intOrNull(form, "seats"),
  contactName: textOrNull(form, "contactName"),
  contactEmail: textOrNull(form, "contactEmail"),
  contactPhone: textOrNull(form, "contactPhone"),
  billingEmail: textOrNull(form, "billingEmail"),
  notes: textOrNull(form, "notes"),
});

export function ClientForm({ client: c, submit, onSave }: { client?: Client; submit: string; onSave: (fields: Record<string, unknown>) => Promise<unknown> }) {
  return (
    <ActionForm action={(form) => onSave(c ? { ...readClient(form), active: checked(form, "active") } : { ...readClient(form), isTest: checked(form, "isTest") })}>
      {(busy) => (
        <>
          <Field label="Name" hint="e.g. Meridian Bank Private Banking">
            <Input name="name" required defaultValue={c?.name ?? ""} />
          </Field>
          <Field label="Kind of client">
            <Select name="kind" defaultValue={c?.kind ?? "bank"}>
              {Object.entries(CLIENT_KINDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contract reference">
            <Input name="contractRef" defaultValue={c?.contractRef ?? ""} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Contract starts">
              <Input name="contractStartsOn" type="date" defaultValue={c?.contractStartsOn ?? ""} />
            </Field>
            <Field label="Contract ends">
              <Input name="contractEndsOn" type="date" defaultValue={c?.contractEndsOn ?? ""} />
            </Field>
          </div>
          <Field label="Seats" hint="The most passes the contract allows at once. Blank for no limit.">
            <Input name="seats" type="number" min={1} defaultValue={c?.seats ?? ""} className="w-36" />
          </Field>
          <Field label="Contact name">
            <Input name="contactName" defaultValue={c?.contactName ?? ""} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Contact phone">
              <Input name="contactPhone" type="tel" defaultValue={c?.contactPhone ?? ""} />
            </Field>
            <Field label="Contact email">
              <Input name="contactEmail" type="email" defaultValue={c?.contactEmail ?? ""} />
            </Field>
          </div>
          <Field label="Billing email" hint="Where invoices go">
            <Input name="billingEmail" type="email" defaultValue={c?.billingEmail ?? ""} />
          </Field>
          <Field label="Notes">
            <Textarea name="notes" defaultValue={c?.notes ?? ""} />
          </Field>
          {c ? <Checkbox name="active" defaultChecked={c.active} label="Active" hint="Inactive clients can't be given new passes; passes already given keep working." /> : <Checkbox name="isTest" label="TEST client" hint="For trying things out; removed with the TEST data." />}
          <Button type="submit" disabled={busy}>
            {submit}
          </Button>
        </>
      )}
    </ActionForm>
  );
}
