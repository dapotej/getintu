"use client";
import { Card, Icon, Input, PageHeader, StatCard, type IconName } from "@intu/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import type { Plan, Venue } from "@/lib/types";

type MemberRow = { id: string; memberships: { status: string }[] };

export default function Home() {
  const { staff, can } = useStaff();
  const router = useRouter();
  const members = useApi<{ members: MemberRow[] }>(can("members.read") ? "/admin/members?limit=200" : null);
  const venues = useApi<{ venues: Venue[] }>(can("partners.read") ? "/admin/venues" : null);
  const plans = useApi<{ plans: Plan[] }>(can("plans.read") ? "/admin/plans" : null);
  const passes = members.data?.members.flatMap((m) => m.memberships) ?? [];
  const firstName = staff.fullName.replace(/^TEST\s+/, "").split(" ")[0];

  return (
    <>
      <PageHeader title={`Hello, ${firstName}`} subtitle="Here's where things stand. Every change you make is logged against your name." />

      {can("members.read") ? (
        <form
          className="relative mb-8 max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/members?q=${encodeURIComponent(String(new FormData(e.currentTarget).get("q")))}`);
          }}
        >
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-faint" />
          <Input name="q" placeholder="Find a member by name, phone, email or pass number" aria-label="Search members" className="h-12 pl-10 text-base shadow-card" />
        </form>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {can("members.read") ? (
          <>
            <StatCard label="Active passes" tone="night" value={members.data ? passes.filter((p) => p.status === "active").length : "–"} hint={`${members.data?.members.length ?? "–"} members in total`} />
            <StatCard label="Suspended" value={members.data ? passes.filter((p) => p.status === "suspended").length : "–"} hint="Declined at every door until reinstated" />
          </>
        ) : null}
        {can("partners.read") ? <StatCard label="Venues" tone="day" value={venues.data ? venues.data.venues.filter((v) => v.active).length : "–"} hint={`${venues.data?.venues.filter((v) => v.tier === "top").length ?? "–"} top tier`} /> : null}
        {can("plans.read") ? <StatCard label="Plans on sale" value={plans.data ? plans.data.plans.filter((p) => p.active).length : "–"} hint="December Pass and annual tiers" /> : null}
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold text-muted">Jump to</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {can("plans.read") ? <Tile href="/plans" icon="layers" title="Plans and benefits" body="Prices, allowances, caps and which venue tiers each plan can use." /> : null}
        {can("partners.read") ? <Tile href="/partners" icon="store" title="Partners and venues" body="Venues, opening hours, tiers and what intu pays per visit." /> : null}
        {can("import.pilot") ? <Tile href="/import" icon="upload" title="Pilot import" body="Bring the December pilot sheet across, with a dry run first." /> : null}
      </div>
    </>
  );
}

function Tile({ href, icon, title, body }: { href: string; icon: IconName; title: string; body: string }) {
  return (
    <Link href={href} className="group block focus-visible:rounded-xl">
      <Card className="h-full transition-[border-color,box-shadow] group-hover:border-line-strong group-hover:shadow-md">
        <div className="flex items-start gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <Icon name={icon} />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1 font-semibold text-fg">
              {title} <Icon name="chevron" className="size-4 text-faint transition-transform group-hover:translate-x-0.5" />
            </p>
            <p className="mt-1 text-sm text-muted">{body}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
