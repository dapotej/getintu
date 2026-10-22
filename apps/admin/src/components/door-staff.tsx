"use client";
import { Badge, Button, Card, EmptyState, Field, Input, Table, Td } from "@intu/ui";
import { useState } from "react";
import { ActionForm, text } from "@/components/forms";
import { api, useApi } from "@/lib/api";

interface DoorStaff {
  id: string;
  fullName: string;
  role: string;
  active: boolean;
  hasPin: boolean;
}

/** Who can sign in to this venue's scanner: the venue's login code plus each person's own PIN. */
export function DoorStaffCard({ venueId, writable }: { venueId: string; writable: boolean }) {
  const { data, reload } = useApi<{ loginCode: string | null; staff: DoorStaff[] }>(`/admin/venues/${venueId}/door-staff`);
  const [resetting, setResetting] = useState<string | null>(null);
  if (!data) return null;
  return (
    <Card
      title="Door scanner"
      description="Staff open the intu scanner on the venue's phone and sign in with the venue code and their own 6-digit PIN."
      flush
      actions={
        writable ? (
          <Button
            size="sm"
            tone="secondary"
            onClick={async () => {
              if (data.loginCode && !window.confirm("A new code signs nobody out, but staff will need it to sign in next time. Make a new code?")) return;
              await api(`/admin/venues/${venueId}/login-code`, { method: "POST" });
              reload();
            }}
          >
            {data.loginCode ? "New venue code" : "Make venue code"}
          </Button>
        ) : null
      }
    >
      <div className="border-b border-line px-5 py-4">
        <p className="text-sm text-muted">Venue code</p>
        <p className="mt-1 font-mono text-2xl font-bold tracking-[0.2em]">{data.loginCode ?? "Not set yet"}</p>
      </div>
      {data.staff.length === 0 ? (
        <EmptyState title="No door staff yet">Add each person who scans at this venue.</EmptyState>
      ) : (
        <Table head={["Name", "Status", ""]}>
          {data.staff.map((s) => (
            <tr key={s.id}>
              <Td>
                <span className="font-semibold">{s.fullName}</span>
                {resetting === s.id ? (
                  <ActionForm
                    className="mt-3 flex flex-wrap items-end gap-2"
                    success="PIN changed."
                    action={async (form) => {
                      await api(`/admin/door-staff/${s.id}`, { method: "PATCH", body: { pin: text(form, "pin") } });
                      setResetting(null);
                    }}
                  >
                    {(busy) => (
                      <>
                        <Field label="New PIN" hint="6 digits. Tell them in person.">
                          <Input name="pin" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="off" className="w-36" />
                        </Field>
                        <Button type="submit" size="sm" disabled={busy}>
                          Save PIN
                        </Button>
                      </>
                    )}
                  </ActionForm>
                ) : null}
              </Td>
              <Td>
                <Badge dot tone={s.active ? "night" : "neutral"}>
                  {s.active ? "Can sign in" : "Removed"}
                </Badge>
              </Td>
              <Td className="whitespace-nowrap text-right">
                {writable ? (
                  <>
                    <Button size="sm" tone="ghost" onClick={() => setResetting(resetting === s.id ? null : s.id)}>
                      {resetting === s.id ? "Cancel" : "Reset PIN"}
                    </Button>
                    <Button
                      size="sm"
                      tone="ghost"
                      onClick={async () => {
                        await api(`/admin/door-staff/${s.id}`, { method: "PATCH", body: { active: !s.active } });
                        reload();
                      }}
                    >
                      {s.active ? "Remove" : "Restore"}
                    </Button>
                  </>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {writable ? (
        <ActionForm
          className="flex flex-wrap items-end gap-3 border-t border-line bg-subtle/60 px-5 py-4"
          action={async (form) => {
            await api(`/admin/venues/${venueId}/door-staff`, { method: "POST", body: { fullName: text(form, "fullName"), pin: text(form, "pin") } });
            reload();
          }}
        >
          {(busy) => (
            <>
              <div className="min-w-56 flex-1">
                <Field label="Add door staff" hint="Their name as colleagues know it">
                  <Input name="fullName" required placeholder="Full name" />
                </Field>
              </div>
              <Field label="PIN" hint="6 digits, different from colleagues'">
                <Input name="pin" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="off" className="w-36" />
              </Field>
              <Button type="submit" disabled={busy}>
                Add
              </Button>
            </>
          )}
        </ActionForm>
      ) : null}
    </Card>
  );
}
