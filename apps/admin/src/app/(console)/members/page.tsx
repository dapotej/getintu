"use client";
import { Badge, Button, Card, Field, Input, PageHeader, Table, Td } from "@intu/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, checked, text, textOrNull } from "@/components/forms";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import type { MemberDetail, Member } from "@/lib/types";

type Row = Member & { memberships: { id: string; status: string; passNumber: string | null; planName: string; endsOn: string }[] };

function Members() {
  const params = useSearchParams();
  const router = useRouter();
  const { can } = useStaff();
  const q = params.get("q") ?? "";
  const { data, error, loading } = useApi<{ members: Row[] }>(`/admin/members?q=${encodeURIComponent(q)}`);

  return (
    <>
      <PageHeader title="Members" subtitle="Partners only ever see a member's name and photo." />
      <form
        className="mb-6 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          router.replace(`/members?q=${encodeURIComponent(String(new FormData(e.currentTarget).get("q")))}`);
        }}
      >
        <Input name="q" defaultValue={q} placeholder="Name, phone, email or pass number" aria-label="Search members" />
      </form>
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card>
          {error ? <p className="text-sm text-pop">{error}</p> : null}
          <Table head={["Name", "Phone", "Pass", "Plan", "Status"]} empty={!loading && data?.members.length === 0 && "No members match."}>
            {data?.members.map((m) => (
              <tr key={m.id}>
                <Td>
                  <Link className="font-semibold text-night hover:underline" href={`/members/${m.id}`}>
                    {m.fullName}
                  </Link>
                  {m.isTest ? <span className="ml-2"><Badge>TEST</Badge></span> : null}
                </Td>
                <Td className="whitespace-nowrap text-cream-muted">{m.phone}</Td>
                <Td>{m.memberships.map((ms) => ms.passNumber).filter(Boolean).join(", ") || "–"}</Td>
                <Td>{m.memberships.map((ms) => ms.planName).join(", ") || "–"}</Td>
                <Td>
                  {m.memberships.map((ms) => (
                    <Badge key={ms.id} tone={ms.status === "active" ? "night" : ms.status === "suspended" ? "pop" : "muted"}>
                      {ms.status}
                    </Badge>
                  ))}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
        {can("members.write") ? (
          <Card title="Add a member">
            <ActionForm
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
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="consentMarketing" /> Agreed to marketing messages
                  </label>
                  <Button type="submit" disabled={busy}>
                    Add member
                  </Button>
                </>
              )}
            </ActionForm>
          </Card>
        ) : null}
      </div>
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
