"use client";
import { Badge, Button, Card, Field, formatDate, Input, PageHeader, Select, Table, Td } from "@intu/ui";
import { ActionForm, text } from "@/components/forms";
import { api, errorMessage, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/labels";
import type { StaffRole, StaffUser } from "@/lib/types";

export default function StaffPage() {
  const { staff: me } = useStaff();
  const { data, error, reload } = useApi<{ staff: StaffUser[] }>("/admin/staff");

  async function update(id: string, body: Partial<Pick<StaffUser, "role" | "active">>) {
    try {
      await api(`/admin/staff/${id}`, { method: "PATCH", body });
      reload();
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader title="Team" subtitle="intu staff who can sign in to this console. Venue staff are managed from the partner app." />
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_20rem]">
        <Card flush>
          {error ? <div className="p-5"><p className="text-sm text-danger">{error}</p></div> : null}
          <Table head={["Name", "Role", "Since", ""]}>
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
        <Card title="Invite someone" description="They get an email to choose a password, then set up two-step verification.">
          <ActionForm
            success="Invitation sent."
            action={async (form) => {
              await api("/admin/staff", { method: "POST", body: { email: text(form, "email"), fullName: text(form, "fullName"), role: text(form, "role") } });
              reload();
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
        </Card>
      </div>
    </>
  );
}
