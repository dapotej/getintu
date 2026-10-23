"use client";
import { Badge, Button, Card, EmptyState, Field, Icon, Input, SidePanel, Table, Td } from "@intu/ui";
import { ActionForm, text } from "@/components/forms";
import { api, useApi } from "@/lib/api";

interface PartnerStaff {
  id: string;
  fullName: string;
  role: string;
  active: boolean;
  hasPin: boolean;
}

/** Who can sign in to this venue's intu scanner: its sign-in code plus each person's own PIN. */
export function PartnerStaffCard({ venueId, writable }: { venueId: string; writable: boolean }) {
  const { data, reload } = useApi<{ loginCode: string | null; staff: PartnerStaff[] }>(`/admin/venues/${venueId}/door-staff`);
  if (!data) return null;
  return (
    <Card
      title="Staff who scan members"
      description="Door staff, drivers and home-service staff. Each opens the intu scanner on their phone (or the venue's), signs in with this code and their own 6-digit PIN, and scans the member when they meet. Add every driver here, not as a separate listing."
      flush
      actions={
        writable ? (
          <>
            <SidePanel
              title="Add staff"
              description="Someone who scans members here. They sign in with the sign-in code and their own PIN."
              trigger={(open) => (
                <Button size="sm" tone="secondary" onClick={open}>
                  <Icon name="plus" className="size-4" /> Add staff
                </Button>
              )}
            >
              {(close) => (
                <ActionForm
                  action={async (form) => {
                    await api(`/admin/venues/${venueId}/door-staff`, { method: "POST", body: { fullName: text(form, "fullName"), pin: text(form, "pin") } });
                    reload();
                    close();
                  }}
                >
                  {(busy) => (
                    <>
                      <Field label="Full name" hint="Their name as colleagues know it">
                        <Input name="fullName" required />
                      </Field>
                      <Field label="PIN" hint="6 digits, different from colleagues'. Tell them in person.">
                        <Input name="pin" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="off" className="w-36" />
                      </Field>
                      <Button type="submit" disabled={busy}>
                        Add staff
                      </Button>
                    </>
                  )}
                </ActionForm>
              )}
            </SidePanel>
            <Button
              size="sm"
              tone="ghost"
              onClick={async () => {
                if (data.loginCode && !window.confirm("A new code signs nobody out, but staff will need it to sign in next time. Make a new code?")) return;
                await api(`/admin/venues/${venueId}/login-code`, { method: "POST" });
                reload();
              }}
            >
              {data.loginCode ? "New sign-in code" : "Make sign-in code"}
            </Button>
          </>
        ) : null
      }
    >
      <div className="border-b border-line px-5 py-4">
        <p className="text-sm text-muted">Sign-in code</p>
        <p className="mt-1 font-mono text-2xl font-bold tracking-[0.2em]">{data.loginCode ?? "Not set yet"}</p>
      </div>
      {data.staff.length === 0 ? (
        <EmptyState title="No staff yet">Add each person who scans members here.</EmptyState>
      ) : (
        <Table head={["Name", "Status", ""]}>
          {data.staff.map((s) => (
            <tr key={s.id}>
              <Td>
                <span className="font-semibold">{s.fullName}</span>
              </Td>
              <Td>
                <Badge dot tone={s.active ? "night" : "neutral"}>
                  {s.active ? "Can sign in" : "Removed"}
                </Badge>
              </Td>
              <Td className="whitespace-nowrap text-right">
                {writable ? (
                  <>
                    <SidePanel
                      title={`New PIN for ${s.fullName}`}
                      trigger={(open) => (
                        <Button size="sm" tone="ghost" onClick={open}>
                          Reset PIN
                        </Button>
                      )}
                    >
                      {(close) => (
                        <ActionForm
                          action={async (form) => {
                            await api(`/admin/door-staff/${s.id}`, { method: "PATCH", body: { pin: text(form, "pin") } });
                            close();
                          }}
                        >
                          {(busy) => (
                            <>
                              <Field label="New PIN" hint="6 digits. Tell them in person.">
                                <Input name="pin" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="off" className="w-36" />
                              </Field>
                              <Button type="submit" disabled={busy}>
                                Save PIN
                              </Button>
                            </>
                          )}
                        </ActionForm>
                      )}
                    </SidePanel>
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
    </Card>
  );
}
