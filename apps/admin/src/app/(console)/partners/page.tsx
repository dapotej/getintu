"use client";
import { Badge, Button, Card, EmptyState, Field, Icon, Input, PageHeader, SidePanel, Table, Td } from "@intu/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionForm, text, textOrNull } from "@/components/forms";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import type { Partner, Venue } from "@/lib/types";

export default function PartnersPage() {
  const { can } = useStaff();
  const writable = can("partners.write");
  const router = useRouter();
  const partners = useApi<{ partners: Partner[] }>("/admin/partners");
  const venues = useApi<{ venues: Venue[] }>("/admin/venues");

  const all = partners.data?.partners ?? [];
  const venuesOf = (id: string) => venues.data?.venues.filter((v) => v.partnerId === id) ?? [];

  return (
    <>
      <PageHeader
        title="Partners"
        subtitle="The businesses intu works with. Open one to see and add its venues."
        actions={
          writable ? (
            <SidePanel
              title="New partner"
              description="Add its venues on the partner's page next."
              trigger={(open) => (
                <Button onClick={open}>
                  <Icon name="plus" className="size-4" /> Add partner
                </Button>
              )}
            >
              {() => (
                <ActionForm
                  action={async (form) => {
                    const { partner } = await api<{ partner: Partner }>("/admin/partners", {
                      method: "POST",
                      body: { legalName: text(form, "legalName"), tradingName: text(form, "tradingName"), contactName: textOrNull(form, "contactName"), contactEmail: textOrNull(form, "contactEmail"), contactPhone: textOrNull(form, "contactPhone"), settlementTerms: textOrNull(form, "settlementTerms") },
                    });
                    router.push(`/partners/${partner.id}`);
                  }}
                >
                  {(busy) => (
                    <>
                      <Field label="Legal name">
                        <Input name="legalName" required />
                      </Field>
                      <Field label="Trading name">
                        <Input name="tradingName" required />
                      </Field>
                      <Field label="Contact name">
                        <Input name="contactName" />
                      </Field>
                      <Field label="Contact phone">
                        <Input name="contactPhone" type="tel" />
                      </Field>
                      <Field label="Contact email">
                        <Input name="contactEmail" type="email" />
                      </Field>
                      <Field label="Settlement terms">
                        <Input name="settlementTerms" placeholder="Monthly in arrears, bank transfer in naira" />
                      </Field>
                      <Button type="submit" disabled={busy}>
                        Add partner
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
        {partners.error ? (
          <div className="p-5">
            <p className="text-sm text-danger">{partners.error}</p>
          </div>
        ) : null}
        {partners.data && all.length === 0 ? (
          <EmptyState title="No partners yet">Add the first business intu works with.</EmptyState>
        ) : (
          <Table head={["Partner", "Contact", "Venues", "Status"]}>
            {all.map((p) => {
              const vs = venuesOf(p.id);
              return (
                <tr key={p.id}>
                  <Td>
                    <Link href={`/partners/${p.id}`} className="font-semibold text-fg hover:text-accent">
                      {p.tradingName}
                    </Link>
                    {p.legalName !== p.tradingName ? <p className="text-xs text-muted">{p.legalName}</p> : null}
                  </Td>
                  <Td className="text-muted">{[p.contactName, p.contactPhone ?? p.contactEmail].filter(Boolean).join(" · ") || <span className="text-faint">–</span>}</Td>
                  <Td>
                    {vs.length ? (
                      <span className="tabular-nums">
                        {vs.length} <span className="text-muted">· {vs.map((v) => v.name).join(", ")}</span>
                      </span>
                    ) : (
                      <span className="text-faint">None yet</span>
                    )}
                  </Td>
                  <Td>
                    <Badge dot tone={p.active ? "night" : "neutral"}>
                      {p.active ? "Active" : "Inactive"}
                    </Badge>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
