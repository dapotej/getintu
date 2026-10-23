"use client";
import { Button, Checkbox, Field, Icon, Input, Select, SidePanel } from "@intu/ui";
import { ActionForm, checked, text } from "@/components/forms";
import { api } from "@/lib/api";
import { USAGE_LABELS, useCatalogue } from "@/lib/catalogue";
import type { Category, UsageMode } from "@/lib/types";

/** Adds a category at the top, or an entry under the given parent. */
export function AddEntryPanel({ parent, onAdded, small }: { parent: Category | null; onAdded: () => void; small?: boolean }) {
  const what = !parent ? "category" : parent.level === "category" ? "subcategory" : "service type";
  return (
    <SidePanel
      title={`Add a ${what}`}
      description={parent ? `Under ${parent.name}. It gets the next free code.` : "It gets the next free code."}
      trigger={(open) => (
        <Button size={small ? "sm" : "md"} tone={small ? "secondary" : "primary"} onClick={open}>
          <Icon name="plus" className="size-4" /> Add a {what}
        </Button>
      )}
    >
      {(close) => (
        <ActionForm
          action={async (form) => {
            await api("/admin/categories", { method: "POST", body: { parentId: parent?.id ?? null, name: text(form, "name") } });
            onAdded();
            close();
          }}
        >
          {(busy) => (
            <>
              <Field label="Name">
                <Input name="name" required minLength={2} />
              </Field>
              <Button type="submit" disabled={busy}>
                Add {what}
              </Button>
            </>
          )}
        </ActionForm>
      )}
    </SidePanel>
  );
}

/** Renames an entry, shows or hides it in the member app, and turns it on or off. */
export function EditEntryPanel({ entry, onSaved }: { entry: Category; onSaved: () => void }) {
  const { usageOf } = useCatalogue();
  // What it would be without its own setting: the entry above's.
  const parentCode = entry.code.split("-").slice(0, -1).join("-");
  const inherited = parentCode ? usageOf(parentCode) : "door";
  return (
    <SidePanel
      title={`Edit ${entry.name}`}
      description={entry.code}
      trigger={(open) => (
        <Button tone="secondary" onClick={open}>
          <Icon name="edit" className="size-4" /> Edit
        </Button>
      )}
    >
      {(close) => (
        <ActionForm
          action={async (form) => {
            const usage = text(form, "usageMode");
            await api(`/admin/categories/${entry.id}`, { method: "PATCH", body: { name: text(form, "name"), customerVisible: checked(form, "customerVisible"), active: checked(form, "active"), usageMode: usage ? (usage as UsageMode) : null } });
            onSaved();
            close();
          }}
        >
          {(busy) => (
            <>
              <Field label="Name">
                <Input name="name" defaultValue={entry.name} required minLength={2} />
              </Field>
              <Field label="How members use it" hint="What the member app tells them to do. Entries under this one follow it unless they have their own.">
                <Select name="usageMode" defaultValue={entry.usageMode ?? ""}>
                  <option value="">{parentCode ? `Same as above: ${USAGE_LABELS[inherited]}` : `Default: ${USAGE_LABELS.door}`}</option>
                  {Object.entries(USAGE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Checkbox name="customerVisible" defaultChecked={entry.customerVisible} label="Shown to members" hint="Hiding it hides what's under it in the member app." />
              <Checkbox name="active" defaultChecked={entry.active} label="On" hint="Turned off, no new offers can use it. Turn off the entries under it first." />
              <Button type="submit" disabled={busy}>
                Save
              </Button>
            </>
          )}
        </ActionForm>
      )}
    </SidePanel>
  );
}
