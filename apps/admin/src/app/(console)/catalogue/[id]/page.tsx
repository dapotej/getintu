"use client";
import { Badge, Card, EmptyState, formatMoney, Icon, PageHeader, Table, Td } from "@intu/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AddEntryPanel, EditEntryPanel } from "@/components/catalogue-panels";
import { useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import { LEVEL_LABEL, markup, OFFER_MODELS, useCatalogue } from "@/lib/catalogue";
import type { CategoryDetail } from "@/lib/types";

const PERIODS = { per_pass: "per pass", per_month: "per calendar month", per_year: "per membership year" };

/** One catalogue entry: who offers it, at what cost, and which plans include it. */
export default function CatalogueEntryPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useStaff();
  const writable = can("plans.write");
  const cat = useCatalogue();
  const { data, error, reload } = useApi<CategoryDetail>(`/admin/categories/${id}`);
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const { category: c, offers, benefits } = data;
  const parents = c.code
    .split("-")
    .slice(0, -1)
    .map((_, i) => cat.byCode.get(c.code.split("-").slice(0, i + 1).join("-")))
    .filter((p) => p !== undefined);
  const kids = cat.children(c.id);
  const partners = new Set(offers.map((o) => o.partner.id)).size;
  const refresh = () => (reload(), cat.reload());

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex flex-wrap items-center gap-1">
            <Link href="/catalogue" className="inline-flex items-center gap-1 hover:text-fg">
              <Icon name="back" className="size-4" /> Catalogue
            </Link>
            {parents.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1">
                <span aria-hidden>›</span>
                <Link href={`/catalogue/${p.id}`} className="hover:text-fg">
                  {p.name}
                </Link>
              </span>
            ))}
          </span>
        }
        title={c.name}
        subtitle={`${LEVEL_LABEL[c.level]} · ${c.code}`}
        actions={
          <>
            {!c.customerVisible ? (
              <Badge>
                <Icon name="eyeOff" className="size-3" /> Hidden from members
              </Badge>
            ) : null}
            {!c.active ? <Badge tone="danger">Off</Badge> : null}
            {writable ? <EditEntryPanel entry={c} onSaved={refresh} /> : null}
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <Card
          title="Offered by"
          description={
            offers.length
              ? `${offers.length} ${offers.length === 1 ? "offer" : "offers"} from ${partners} ${partners === 1 ? "partner" : "partners"}${c.level === "service" ? "" : `, across what's under ${c.name}`}. Cost is what intu pays per visit.`
              : undefined
          }
          flush
        >
          {offers.length === 0 ? (
            <EmptyState title="No venue offers this yet">Add an offer on a venue's page to make it usable.</EmptyState>
          ) : (
            <Table head={["Partner and venue", c.level === "service" ? null : "Service", "Cost", "Retail", "Markup", "How it's offered", ""].filter((h) => h !== null)}>
              {offers.map((o) => (
                <tr key={o.id}>
                  <Td>
                    <Link href={`/partners/${o.partner.id}/venues/${o.venue.id}`} className="font-semibold text-fg hover:text-accent">
                      {o.venue.name}
                    </Link>
                    <span className="block text-xs text-muted">
                      {o.partner.tradingName} · {o.venue.kind === "visiting" ? "visiting service" : o.venue.area}
                    </span>
                  </Td>
                  {c.level === "service" ? null : <Td>{o.service.name}</Td>}
                  <Td className="whitespace-nowrap tabular-nums">
                    {formatMoney(o.rateMinor, o.rateCurrency)}
                    {o.pricesArePlaceholders ? (
                      <span className="ml-2">
                        <Badge tone="day">Placeholder</Badge>
                      </span>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">{o.retailMinor === null ? <span className="text-faint">–</span> : formatMoney(o.retailMinor, o.rateCurrency)}</Td>
                  <Td className="tabular-nums">{markup(o.rateMinor, o.retailMinor) ?? <span className="text-faint">–</span>}</Td>
                  <Td className="text-muted">{OFFER_MODELS[o.offerModel]}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      {o.venue.tier === "top" ? <Badge tone="day">Top tier</Badge> : null}
                      {!o.active || !o.venue.active ? (
                        <Badge dot tone="danger">
                          Inactive
                        </Badge>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="In plans" description="Plans whose benefits include it: all of it, or one part of it." flush>
          {benefits.length === 0 ? (
            <EmptyState title="No plan includes this yet" />
          ) : (
            <Table head={["Plan", "Benefit", "Allowance"]}>
              {benefits.map((b) => (
                <tr key={b.id}>
                  <Td>
                    <Link href={`/plans/${b.plan.id}`} className="font-semibold text-fg hover:text-accent">
                      {b.plan.name}
                    </Link>
                    {!b.plan.active ? <span className="ml-2 text-xs text-muted">inactive</span> : null}
                  </Td>
                  <Td>
                    {b.name}
                    {b.covers === "part" ? <span className="block text-xs text-muted">Part of {c.name}</span> : null}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="font-medium tabular-nums">{b.quantity ?? "Unlimited"}</span> <span className="text-muted">{PERIODS[b.period]}</span>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {c.level !== "service" ? (
          <Card title={c.level === "category" ? "Subcategories" : "Service types"} flush actions={writable ? <AddEntryPanel parent={c} onAdded={refresh} small /> : null}>
            {kids.length === 0 ? (
              <EmptyState title="Nothing under it yet" />
            ) : (
              <ul>
                {kids.map((k) => (
                  <li key={k.id} className="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0">
                    <Link href={`/catalogue/${k.id}`} className="font-medium hover:text-accent">
                      {k.name}
                    </Link>
                    <code className="text-xs text-faint">{k.code}</code>
                    {!k.customerVisible ? <Badge>Hidden from members</Badge> : null}
                    {!k.active ? <Badge tone="danger">Off</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
