"use client";
import type { BenefitCost, PlanCosting } from "@intu/rules";
import { Badge, Card, cx, formatMoney, Table, Td } from "@intu/ui";
import Link from "next/link";
import type { Plan } from "@/lib/types";

const naira = (kobo: number) => formatMoney(kobo, "NGN");

/** What the plan costs intu to deliver, and the margin at each price. Worked out by the API. */
export function PlanCostingCard({ plan, costing }: { plan: Plan; costing: PlanCosting }) {
  const byId = new Map((plan.benefits ?? []).map((b) => [b.id, b]));
  const people = plan.groupSize > 1 ? ` × ${plan.groupSize} people` : "";
  const unpriced = costing.benefits.filter((c) => c.issue).length;

  return (
    <Card
      title="Cost and margin"
      description={`What intu pays partners to deliver one pass${plan.groupSize > 1 ? ` (${plan.groupSize} people)` : ""}: if every allowance is used, and at each benefit's expected use.`}
      className="mt-6"
      flush
      actions={costing.placeholder ? <Badge tone="day">Includes placeholder prices</Badge> : null}
    >
      <div className="grid gap-px border-b border-line bg-line sm:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
        {costing.margins.length === 0 ? <p className="bg-surface p-5 text-sm text-muted">Add prices to see the margin.</p> : null}
        {costing.margins.map((m) => (
          <div key={m.currency} className="bg-surface p-5">
            <p className="text-sm text-muted">
              Sold at <span className="font-semibold text-fg tabular-nums">{formatMoney(m.priceMinor, m.currency)}</span>
              {m.currency !== "NGN" && m.priceNgnMinor !== null ? <span className="tabular-nums"> ≈ {naira(m.priceNgnMinor)}</span> : null}
            </p>
            {m.expectedMarginMinor === null ? (
              <p className="mt-2 text-sm text-muted">
                No exchange rate for {m.currency}. <Link href="/plans" className="font-semibold text-accent hover:underline">Set one on Plans</Link>.
              </p>
            ) : (
              <>
                <p className={cx("mt-1 text-2xl font-bold tabular-nums", m.expectedMarginMinor < 0 ? "text-danger" : "text-fg")}>
                  {naira(m.expectedMarginMinor)} <span className="text-base font-semibold text-muted">{m.expectedMarginPct}%</span>
                </p>
                <p className="text-sm text-muted">margin at expected use</p>
                <p className={cx("mt-2 text-sm tabular-nums", (m.fullMarginMinor ?? 0) < 0 ? "font-semibold text-danger" : "text-muted")}>
                  {naira(m.fullMarginMinor ?? 0)} if every allowance is used
                </p>
              </>
            )}
          </div>
        ))}
      </div>

      <Table head={["Benefit", "Uses", "Cost", "If fully used", "Expected", "Expected cost"]}>
        {costing.benefits.map((c) => {
          const b = byId.get(c.benefitId);
          return (
            <tr key={c.benefitId}>
              <Td className="font-medium">
                {b?.category.name ?? "Benefit"}
                {c.placeholder ? <span className="ml-2 align-middle text-xs font-normal text-day">placeholder</span> : null}
              </Td>
              <Td className="whitespace-nowrap tabular-nums text-muted">{c.costBasis === "flat_per_member" ? "Flat fee" : c.uses === null ? "Unlimited" : c.uses}</Td>
              <Td>
                <UnitCost c={c} people={people} />
              </Td>
              <Td className="whitespace-nowrap tabular-nums">{c.fullMinor === null ? <span className="text-faint">–</span> : naira(c.fullMinor)}</Td>
              <Td className="whitespace-nowrap tabular-nums text-muted">{c.costBasis === "flat_per_member" ? "Always paid" : c.uses === null ? "–" : `${b?.expectedUsePct ?? 0}%`}</Td>
              <Td className="whitespace-nowrap font-medium tabular-nums">{c.expectedMinor === null ? <span className="text-faint">–</span> : naira(c.expectedMinor)}</Td>
            </tr>
          );
        })}
        <tr>
          <Td className="font-medium">Concierge, operations and payment fees</Td>
          <Td className="text-muted">Per member</Td>
          <Td className="whitespace-nowrap tabular-nums text-muted">
            {naira(plan.overheadPerMemberMinor)}
            {people}
          </Td>
          <Td className="tabular-nums">{naira(costing.overheadMinor)}</Td>
          <Td className="text-muted">Always paid</Td>
          <Td className="font-medium tabular-nums">{naira(costing.overheadMinor)}</Td>
        </tr>
        <tr className="bg-subtle/60">
          <Td className="font-semibold">Total cost</Td>
          <Td>{null}</Td>
          <Td className="text-sm text-muted">{unpriced ? `Leaves out ${unpriced} unpriced benefit${unpriced > 1 ? "s" : ""}` : null}</Td>
          <Td className="font-semibold tabular-nums">{naira(costing.fullMinor)}</Td>
          <Td>{null}</Td>
          <Td className="font-semibold tabular-nums">{naira(costing.expectedMinor)}</Td>
        </tr>
      </Table>
    </Card>
  );
}

function UnitCost({ c, people }: { c: BenefitCost; people: string }) {
  if (c.issue === "unlimited") return <span className="text-sm text-danger">Unlimited at a cost per use: set a flat fee per member</span>;
  if (c.issue === "no_cost") return <span className="text-sm text-danger">{c.costBasis === "flat_per_member" ? "Set the flat fee" : "No venue offers it yet: set a planning cost"}</span>;
  const range = c.offerRange && c.offerRange.minMinor !== c.offerRange.maxMinor ? ` (${naira(c.offerRange.minMinor)}–${naira(c.offerRange.maxMinor)})` : "";
  return (
    <span className="whitespace-nowrap tabular-nums">
      {naira(c.unitCostMinor ?? 0)}
      {c.costBasis === "flat_per_member" ? ` per member${people}` : ""}
      <span className="block text-xs text-muted">
        {c.source === "planned"
          ? "Planning cost"
          : `Average of ${c.offerRange?.count ?? 0} offer${c.offerRange?.count === 1 ? "" : "s"}${range}`}
      </span>
    </span>
  );
}
