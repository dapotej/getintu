"use client";
import { Badge, Button, Card, cx, Icon, PageHeader } from "@intu/ui";
import Link from "next/link";
import { useState } from "react";
import { AddEntryPanel } from "@/components/catalogue-panels";
import { useStaff } from "@/lib/auth";
import { isNight, LEVEL_LABEL, useCatalogue } from "@/lib/catalogue";
import type { Category } from "@/lib/types";

export default function CataloguePage() {
  const { can } = useStaff();
  const cat = useCatalogue();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((o) => (o.has(id) ? (o.delete(id), new Set(o)) : new Set(o.add(id))));
  const top = cat.children(null);
  const services = cat.all.filter((c) => c.level === "service").length;

  return (
    <>
      <PageHeader
        title="Catalogue"
        subtitle={`What intu offers, as categories, subcategories and service types (${top.length}, ${cat.all.length - top.length - services} and ${services}). Plans grant benefits at any level; each venue offer delivers one service type. Open an entry to see who offers it.`}
        actions={
          <>
            <Button tone="secondary" onClick={() => setOpen(open.size ? new Set() : new Set(cat.all.filter((c) => c.level !== "service").map((c) => c.id)))}>
              {open.size ? "Collapse all" : "Expand all"}
            </Button>
            {can("plans.write") ? <AddEntryPanel parent={null} onAdded={cat.reload} /> : null}
          </>
        }
      />
      {cat.error ? <p className="mb-4 text-sm text-danger">Couldn&apos;t load the catalogue: {cat.error}. Reload the page to try again.</p> : null}
      {!cat.ready && !cat.error ? <p className="text-sm text-muted">Loading…</p> : null}
      <div className="flex flex-col gap-3">
        {top.map((c) => (
          <Card key={c.id} flush>
            <Node c={c} depth={0} cat={cat} open={open} toggle={toggle} />
          </Card>
        ))}
      </div>
    </>
  );
}

function Node({ c, depth, cat, open, toggle }: { c: Category; depth: number; cat: ReturnType<typeof useCatalogue>; open: Set<string>; toggle: (id: string) => void }) {
  const kids = cat.children(c.id);
  const expanded = open.has(c.id);
  return (
    <div className={cx(depth > 0 && "border-t border-line")}>
      <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3", depth === 2 && "pl-16", depth === 1 && "pl-10", !c.active && "opacity-60")}>
        {c.level !== "service" ? (
          <button type="button" aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${c.name}`} onClick={() => toggle(c.id)} className="-ml-1 rounded p-0.5 text-faint hover:text-fg">
            <Icon name="chevron" className={cx("size-4 transition-transform", expanded && "rotate-90")} />
          </button>
        ) : (
          <span aria-hidden className={cx("size-1.5 rounded-full", isNight(c.code) ? "bg-brand-night" : "bg-brand-day")} />
        )}
        <Link href={`/catalogue/${c.id}`} className={cx("hover:text-accent", c.level === "category" ? "font-semibold" : c.level === "subcategory" ? "font-medium" : "text-sm")}>
          {c.name}
        </Link>
        <code className="text-xs text-faint">{c.code}</code>
        {c.level !== "service" && kids.length ? <span className="text-xs text-muted">{kids.length}</span> : null}
        {!c.customerVisible ? (
          <Badge>
            <Icon name="eyeOff" className="size-3" /> Hidden from members
          </Badge>
        ) : null}
        {!c.active ? <Badge tone="danger">Off</Badge> : null}
        <span className="ml-auto text-xs text-faint">{LEVEL_LABEL[c.level]}</span>
      </div>
      {expanded
        ? kids.map((k) => <Node key={k.id} c={k} depth={depth + 1} cat={cat} open={open} toggle={toggle} />)
        : null}
    </div>
  );
}
