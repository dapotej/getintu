"use client";
import { Badge, Button, Card, Field, formatDate, Icon, Input, Select, SidePanel, Table, Td } from "@intu/ui";
import { ActionForm, text } from "@/components/forms";
import { SettingsHeader } from "@/components/settings-header";
import { api, errorMessage, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/labels";
import type { StaffRole, StaffUser } from "@/lib/types";

export default function TeamPage() {
  const { staff: me } = useStaff();
  const { data, error, reload } = useApi<{ staff: StaffUser[] }>("/admin/staff");

  async function update(id: string, body: Partial<Pick<StaffUser, "role" | "active" | "canApprovePayouts">>) {
    try {
      await api(`/admin/staff/${id}`, { method: "PATCH", body });
      reload();
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  return (
    <>
      <SettingsHeader />
      <Card
        flush
        title="Team"
        description="intu staff who can sign in to this console. Partner staff are added on each listing's page."
        actions={
          <SidePanel
            title="Invite someone"
            description="They get an email to choose a password, then set up two-step verification."
            trigger={(open) => (
              <Button onClick={open}>
                <Icon name="plus" className="size-4" /> Invite someone
              </Button>
            )}
          >
            {(close) => (
              <ActionForm
                action={async (form) => {
                  await api("/admin/staff", { method: "POST", body: { email: text(form, "email"), fullName: text(form, "fullName"), role: text(form, "role") } });
                  reload();
                  close();
                }}
              >
                {(busy) => (
                  <>
                    <Field label="Full name">
                      <Input name="fullName" required />
                    </Field>
                    <Field label="Work email">
                      <Input name="email" type="email" required />
                    </Field>
                    <Field label="Role">
                      <Select name="role" defaultValue="concierge">
                        {Object.entries(ROLE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Button type="submit" disabled={busy}>
                      Send invitation
                    </Button>
                  </>
                )}
              </ActionForm>
            )}
          </SidePanel>
        }
      >
        {error ? <div className="p-5"><p className="text-sm text-danger">{error}</p></div> : null}
        <Table head={["Name", "Role", "Approves payouts", "Since", ""]}>
          {data?.staff.map((s) => (
            <tr key={s.id}>
              <Td>
                <p className="font-semibold">
                  {s.fullName} {s.id === me.id ? <Badge tone="accent">You</Badge> : null}
                </p>
                <p className="text-xs text-muted">{s.email}</p>
              </Td>
              <Td>
                <Select className="min-w-36" aria-label={`Role for ${s.fullName}`} value={s.role} disabled={s.id === me.id || !s.active} onChange={(e) => update(s.id, { role: e.target.value as StaffRole })}>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Td>
              <Td>
                {/* A second person approves partner statements; nobody switches this on for themselves. */}
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`${s.fullName} can approve payouts`}
                    checked={s.canApprovePayouts}
                    disabled={s.id === me.id || !s.active}
                    onChange={(e) => update(s.id, { canApprovePayouts: e.target.checked })}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  <span className="text-muted">{s.canApprovePayouts ? "Yes" : "No"}</span>
                </label>
              </Td>
              <Td className="whitespace-nowrap text-muted">{formatDate(s.createdAt.slice(0, 10))}</Td>
              <Td className="text-right">
                {s.id === me.id ? null : s.active ? (
                  <Button size="sm" tone="ghost" onClick={() => confirm(`Remove ${s.fullName}'s access? They'll be signed out everywhere.`) && update(s.id, { active: false })}>
                    Remove access
                  </Button>
                ) : (
                  <Badge dot tone="danger">
                    No access
                  </Badge>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
