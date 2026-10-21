"use client";
import { Badge, Button, Card, Field, formatMoney, Input, PageHeader, Table, Td } from "@intu/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionForm, intOrNull, text, textOrNull } from "@/components/forms";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import type { Plan } from "@/lib/types";

export default function PlansPage() {
  const { can } = useStaff();
  const router = useRouter();
  const { data, error } = useApi<{ plans: Plan[] }>("/admin/plans");

  return (
    <>
      <PageHeader title="Plans and benefits" subtitle="Changing a plan affects new memberships; allowances already granted keep their numbers." />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card>
          {error ? <p className="text-sm text-pop">{error}</p> : null}
          <Table head={["Plan", "Code", "Prices", "Dates", ""]} empty={data?.plans.length === 0 && "No plans yet."}>
            {data?.plans.map((p) => (
              <tr key={p.id}>
                <Td>
                  <Link href={`/plans/${p.id}`} className="font-semibold text-night hover:underline">
                    {p.name}
                  </Link>
                  {p.groupSize > 1 ? <span className="ml-2 text-xs text-cream-muted">group of {p.groupSize}</span> : null}
                </Td>
                <Td className="text-cream-muted">{p.code}</Td>
                <Td>{p.prices.map((x) => formatMoney(x.amountMinor, x.currency)).join(" · ") || "–"}</Td>
                <Td className="text-cream-muted">{p.seasonStartsOn ? `${p.seasonStartsOn} → ${p.seasonEndsOn}` : p.durationDays ? `${p.durationDays} days` : "–"}</Td>
                <Td>
                  {!p.active ? <Badge>inactive</Badge> : null} {p.isTest ? <Badge>TEST</Badge> : null}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
        {can("plans.write") ? (
          <Card title="New plan">
            <ActionForm
              action={async (form) => {
                const { plan } = await api<{ plan: Plan }>("/admin/plans", {
                  method: "POST",
                  body: {
                    code: text(form, "code").toUpperCase(),
                    name: text(form, "name"),
                    seasonStartsOn: textOrNull(form, "seasonStartsOn"),
                    seasonEndsOn: textOrNull(form, "seasonEndsOn"),
                    durationDays: intOrNull(form, "durationDays"),
                    groupSize: intOrNull(form, "groupSize") ?? 1,
                  },
                });
                router.push(`/plans/${plan.id}`);
              }}
            >
              {(busy) => (
                <>
                  <Field label="Name">
                    <Input name="name" placeholder="December Pass Plus 2027" required />
                  </Field>
                  <Field label="Code" hint="Short and unique, e.g. DEC27-PLUS">
                    <Input name="code" required />
                  </Field>
                  <p className="text-xs text-cream-muted">Season dates for a pass, or a duration for annual tiers.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Season starts">
                      <Input name="seasonStartsOn" type="date" />
                    </Field>
                    <Field label="Season ends">
                      <Input name="seasonEndsOn" type="date" />
                    </Field>
                    <Field label="Duration (days)">
                      <Input name="durationDays" type="number" min={1} />
                    </Field>
                    <Field label="People per pass">
                      <Input name="groupSize" type="number" min={1} defaultValue={1} />
                    </Field>
                  </div>
                  <Button type="submit" disabled={busy}>
                    Create plan
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
