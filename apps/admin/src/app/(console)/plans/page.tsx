"use client";
import { Badge, Button, Card, EmptyState, Field, formatDate, formatMoney, Icon, Input, PageHeader, SidePanel, Table, Td } from "@intu/ui";
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
      <PageHeader
        title="Plans and benefits"
        subtitle="Changing a plan affects new memberships. Allowances already granted keep their numbers."
        actions={
          can("plans.write") ? (
            <SidePanel
              title="New plan"
              description="Give a pass season dates, or an annual tier a duration. Prices and benefits come next."
              trigger={(open) => (
                <Button onClick={open}>
                  <Icon name="plus" className="size-4" /> New plan
                </Button>
              )}
            >
              {() => (
                <ActionForm
                  action={async (form) => {
                    const { plan } = await api<{ plan: Plan }>("/admin/plans", {
                      method: "POST",
                      body: {
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
                      <Field label="People per pass">
                        <Input name="groupSize" type="number" min={1} defaultValue={1} />
                      </Field>
                      <Field label="Season starts">
                        <Input name="seasonStartsOn" type="date" />
                      </Field>
                      <Field label="Season ends">
                        <Input name="seasonEndsOn" type="date" />
                      </Field>
                      <Field label="Duration (days)" hint="For annual tiers">
                        <Input name="durationDays" type="number" min={1} />
                      </Field>
                      <Button type="submit" disabled={busy}>
                        Create plan
                      </Button>
                    </>
                  )}
                </ActionForm>
              )}
            </SidePanel>
          ) : null
        }
      />

      <Card flush>
        {error ? <div className="p-5"><p className="text-sm text-danger">{error}</p></div> : null}
        {data?.plans.length === 0 ? (
          <EmptyState title="No plans yet" />
        ) : (
          <Table head={["Plan", "Prices", "Runs", "Status"]}>
            {data?.plans.map((p) => (
              <tr key={p.id}>
                <Td>
                  <Link href={`/plans/${p.id}`} className="font-semibold text-fg hover:text-accent">
                    {p.name}
                  </Link>
                  <p className="text-xs text-muted">
                    {p.code}
                    {p.groupSize > 1 ? ` · ${p.groupSize} people` : ""}
                  </p>
                </Td>
                <Td className="whitespace-nowrap font-medium tabular-nums">{p.prices.map((x) => formatMoney(x.amountMinor, x.currency)).join("  ·  ") || <span className="text-faint">Not priced</span>}</Td>
                <Td className="whitespace-nowrap text-muted">
                  {p.seasonStartsOn && p.seasonEndsOn ? `${formatDate(p.seasonStartsOn)} – ${formatDate(p.seasonEndsOn)}` : p.durationDays ? `${p.durationDays} days from purchase` : "–"}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <Badge dot tone={p.active ? "night" : "neutral"}>
                      {p.active ? "Active" : "Inactive"}
                    </Badge>
                    {p.isTest ? <Badge>TEST</Badge> : null}
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
