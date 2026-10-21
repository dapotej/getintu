"use client";
import { Card, Input, PageHeader } from "@intu/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStaff } from "@/lib/auth";

export default function Home() {
  const { staff, can } = useStaff();
  const router = useRouter();
  return (
    <>
      <PageHeader title={`Hello, ${staff.fullName.split(" ")[0]}`} subtitle="Everything here is logged against your name." />
      {can("members.read") ? (
        <Card title="Find a member" className="max-w-xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = String(new FormData(e.currentTarget).get("q"));
              router.push(`/members?q=${encodeURIComponent(q)}`);
            }}
          >
            <Input name="q" placeholder="Name, phone, email or pass number" aria-label="Search members" />
          </form>
        </Card>
      ) : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {can("plans.read") ? <Tile href="/plans" title="Plans and benefits" body="Prices, allowances, caps and which venue tiers each plan can use." /> : null}
        {can("partners.read") ? <Tile href="/partners" title="Partners and venues" body="Venues, opening hours, tiers and what intu pays per visit." /> : null}
        {can("import.pilot") ? <Tile href="/import" title="Pilot import" body="Bring the December pilot sheet across, with a dry run first." /> : null}
      </div>
    </>
  );
}

function Tile({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-ink-line bg-ink-raised p-5 transition hover:border-night/60">
      <h2 className="font-bold">{title}</h2>
      <p className="mt-1 text-sm text-cream-muted">{body}</p>
    </Link>
  );
}
