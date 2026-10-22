"use client";
import { Badge, Button, Card, Checkbox, EmptyState, Field, Icon, Input, PageHeader, Table, Td } from "@intu/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ActionForm, checked, text, textOrNull } from "@/components/forms";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import { STATUS_LABELS, statusTone } from "@/lib/labels";
import type { Member, MemberDetail } from "@/lib/types";

type Row = Member & { memberships: { id: string; status: string; passNumber: string | null; planName: string; endsOn: string }[] };

function Members() {
  const params = useSearchParams();
  const router = useRouter();
  const { can } = useStaff();
  const [adding, setAdding] = useState(false);
  const q = params.get("q") ?? "";
  const { data, error, loading } = useApi<{ members: Row[] }>(`/admin/members?q=${encodeURIComponent(q)}`);

  return (
    <>
      <PageHeader
        title="Members"
        subtitle="Search by name, phone, email or pass number. Venues only ever see a member's name and photo."
        actions={
          can("members.write") ? (
            <Button onClick={() => setAdding((a) => !a)}>
              <Icon name="plus" className="size-4" /> {adding ? "Close" : "New member"}
            </Button>
          ) : null
        }
      />

      {adding && can("members.write") ? (
        <Card title="Add a member" description="Then give them a pass from their profile." className="mb-6">
          <ActionForm
            className="grid gap-4 sm:grid-cols-2"
            action={async (form) => {
              const created = await api<MemberDetail>("/admin/members", {
                method: "POST",
                body: { fullName: text(form, "fullName"), phone: text(form, "phone").replace(/\s/g, ""), email: textOrNull(form, "email"), country: textOrNull(form, "country"), consentMarketing: checked(form, "consentMarketing") },
              });
              router.push(`/members/${created.member.id}`);
            }}
          >
            {(busy) => (
              <>
                <Field label="Full name">
                  <Input name="fullName" required />
                </Field>
                <Field label="Phone (WhatsApp)" hint="International format, e.g. +44 7700 900123">
                  <Input name="phone" type="tel" required />
                </Field>
                <Field label="Email">
                  <Input name="email" type="email" />
                </Field>
                <Field label="Country" hint="Two letters, e.g. GB, US, NG">
                  <Input name="country" maxLength={2} />
                </Field>
                <div className="sm:col-span-2">
                  <Checkbox name="consentMarketing" label="Agreed to marketing messages" />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={busy}>
                    Add member
                  </Button>
                </div>
              </>
            )}
          </ActionForm>
        </Card>
      ) : null}

      <form
        className="relative mb-4 max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          router.replace(`/members?q=${encodeURIComponent(String(new FormData(e.currentTarget).get("q")))}`);
        }}
      >
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-faint" />
        <Input name="q" defaultValue={q} placeholder="Name, phone, email or pass number" aria-label="Search members" className="pl-10" />
      </form>

      <Card flush>
        {error ? <div className="p-5"><p className="text-sm text-danger">{error}</p></div> : null}
        {!loading && data?.members.length === 0 ? (
          <EmptyState title={q ? `No members match "${q}"` : "No members yet"}>{q ? "Try part of a name or the last digits of a phone number." : null}</EmptyState>
        ) : (
          <Table head={["Member", "Phone", "Pass", "Plan", "Status"]}>
            {data?.members.map((m) => (
              <tr key={m.id}>
                <Td>
                  <Link className="font-semibold text-fg hover:text-accent" href={`/members/${m.id}`}>
                    {m.fullName}
                  </Link>
                  {m.email ? <p className="text-xs text-muted">{m.email}</p> : null}
                </Td>
                <Td className="whitespace-nowrap tabular-nums text-muted">{m.phone}</Td>
                <Td className="whitespace-nowrap font-medium tabular-nums">{m.memberships.map((ms) => ms.passNumber).filter(Boolean).join(", ") || <span className="text-faint">–</span>}</Td>
                <Td className="text-muted">{m.memberships.map((ms) => ms.planName).join(", ") || <span className="text-faint">No pass</span>}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {m.memberships.map((ms) => (
                      <Badge key={ms.id} dot tone={statusTone(ms.status)}>
                        {STATUS_LABELS[ms.status] ?? ms.status}
                      </Badge>
                    ))}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

export default function MembersPage() {
  return (
    <Suspense>
      <Members />
    </Suspense>
  );
}
