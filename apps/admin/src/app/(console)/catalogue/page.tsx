"use client";
import { Badge, Button, Card, cx, Icon, Input, Notice, PageHeader } from "@intu/ui";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import { isNight, useCatalogue } from "@/lib/catalogue";
import type { Category } from "@/lib/types";

const LEVEL_LABEL = { category: "Category", subcategory: "Subcategory", service: "Service type" };

export default function CataloguePage() {
  const { can } = useStaff();
  const writable = can("plans.write");
  const cat = useCatalogue();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((o) => (o.has(id) ? (o.delete(id), new Set(o)) : new Set(o.add(id))));

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      cat.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const ctx: Ctx = { cat, open, toggle, act, writable };
  const top = cat.children(null);
  const services = cat.all.filter((c) => c.level === "service").length;

  return (
    <>
      <PageHeader
        title="Catalogue"
        subtitle={`What intu offers, as categories, subcategories and service types (${top.length}, ${cat.all.length - top.length - services} and ${services}). Plans grant benefits at any level; each venue offer delivers one service type.`}
        actions={
          <Button tone="secondary" onClick={() => setOpen(open.size ? new Set() : new Set(cat.all.filter((c) => c.level !== "service").map((c) => c.id)))}>
            {open.size ? "Collapse all" : "Expand all"}
          </Button>
        }
      />
      {error ? (
        <div className="mb-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        {top.map((c) => (
          <Card key={c.id} flush>
            <Node c={c} depth={0} ctx={ctx} />
          </Card>
        ))}
        {writable ? <AddChild parentId={null} label="Add a category" act={act} /> : null}
      </div>
    </>
  );
}

interface Ctx {
  cat: ReturnType<typeof useCatalogue>;
  open: Set<string>;
  toggle: (id: string) => void;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  writable: boolean;
}

function Node({ c, depth, ctx }: { c: Category; depth: number; ctx: Ctx }) {
  const { cat, open, toggle, act, writable } = ctx;
  const kids = cat.children(c.id);
  const expanded = open.has(c.id);
  const [renaming, setRenaming] = useState(false);
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
        {renaming ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name")).trim();
              void act(() => api(`/admin/categories/${c.id}`, { method: "PATCH", body: { name } })).then(() => setRenaming(false));
            }}
          >
            <Input name="name" defaultValue={c.name} aria-label={`New name for ${c.name}`} className="h-8 w-64" autoFocus />
            <Button size="sm" type="submit">
              Save
            </Button>
            <Button size="sm" tone="ghost" type="button" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <span className={cx(c.level === "category" ? "font-semibold" : c.level === "subcategory" ? "font-medium" : "text-sm")}>{c.name}</span>
        )}
        <code className="text-xs text-faint">{c.code}</code>
        {c.level !== "service" && kids.length ? <span className="text-xs text-muted">{kids.length}</span> : null}
        {!c.customerVisible ? (
          <Badge>
            <Icon name="eyeOff" className="size-3" /> Hidden from members
          </Badge>
        ) : null}
        {!c.active ? <Badge tone="danger">Off</Badge> : null}
        {writable && !renaming ? (
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" tone="ghost" onClick={() => setRenaming(true)}>
              Rename
            </Button>
            <Button size="sm" tone="ghost" onClick={() => act(() => api(`/admin/categories/${c.id}`, { method: "PATCH", body: { customerVisible: !c.customerVisible } }))}>
              {c.customerVisible ? "Hide" : "Show"}
            </Button>
            <Button size="sm" tone="ghost" onClick={() => act(() => api(`/admin/categories/${c.id}`, { method: "PATCH", body: { active: !c.active } }))}>
              {c.active ? "Turn off" : "Turn on"}
            </Button>
          </div>
        ) : (
          <span className="ml-auto text-xs text-faint">{LEVEL_LABEL[c.level]}</span>
        )}
      </div>
      {expanded ? (
        <>
          {kids.map((k) => (
            <Node key={k.id} c={k} depth={depth + 1} ctx={ctx} />
          ))}
          {writable ? (
            <div className={cx("border-t border-line px-5 py-2", depth === 0 ? "pl-10" : "pl-16")}>
              <AddChild parentId={c.id} label={c.level === "category" ? `Add a subcategory to ${c.name}` : `Add a service type to ${c.name}`} compact act={act} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
  }

function AddChild({ parentId, label, compact, act }: { parentId: string | null; label: string; compact?: boolean; act: Ctx["act"] }) {
  const [adding, setAdding] = useState(false);
  if (!adding)
    return (
      <div>
        <Button size="sm" tone={compact ? "ghost" : "secondary"} onClick={() => setAdding(true)}>
          <Icon name="plus" className="size-4" /> {label}
        </Button>
      </div>
    );
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const name = String(new FormData(e.currentTarget).get("name")).trim();
        void act(() => api("/admin/categories", { method: "POST", body: { parentId, name } })).then(() => setAdding(false));
      }}
    >
      <Input name="name" placeholder="Name" aria-label={label} className="h-8 w-64" autoFocus required minLength={2} />
      <Button size="sm" type="submit">
        Add
      </Button>
      <Button size="sm" tone="ghost" type="button" onClick={() => setAdding(false)}>
        Cancel
      </Button>
    </form>
  );
}
