// Client accounts (banks and fintechs first): the passes they pay for, held as seats on a plan.
// intu's team adds people one at a time, from a list, or as passes waiting for a name; removing
// someone ends their pass that day and frees the seat. Clients only ever get usage totals, never
// an individual's visits (spec: Privacy). Invoices are recorded by hand until payments exist.
import { Hono } from "hono";
import { and, asc, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { toLagos } from "@intu/rules";
import { z } from "zod";
import { grantAllowances, one, schema, type Db, type Tx } from "@intu/db";
import { requirePermission, type AdminEnv, type StaffContext } from "../auth/staff.ts";
import { body, fail } from "../http.ts";
import { readTable } from "../import/csv.ts";
import { normalisePhone } from "../import/pilot.ts";
import { staffAudit } from "./audited.ts";
import { currency, idParam, isoDate, minorUnits, uuid } from "./validation.ts";

const { categories, clientAccounts, clientInvoices, clientSeats, members, memberships, plans, redemptions } = schema;

const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/, "Use international format, e.g. +2348012345678");
const optionalText = (max: number) => z.string().trim().max(max).nullable();

const ClientFields = z.object({
  name: z.string().trim().min(2).max(200),
  kind: z.enum(["bank", "employer", "promoter"]),
  contractRef: optionalText(100),
  contractStartsOn: isoDate.nullable(),
  contractEndsOn: isoDate.nullable(),
  seats: z.number().int().positive().max(100_000).nullable(),
  contactName: optionalText(200),
  contactEmail: z.email().nullable(),
  contactPhone: optionalText(40),
  billingEmail: z.email().nullable(),
  notes: optionalText(4000),
  active: z.boolean(),
  isTest: z.boolean(),
});

const SeatTerms = z.object({ planId: uuid, startsOn: isoDate.optional(), endsOn: isoDate.optional() });
const Person = z.object({
  fullName: z.string().trim().min(2).max(200),
  phone: e164,
  email: z.email().nullable().optional(),
  customerRef: optionalText(100).optional(),
});

const InvoiceFields = z.object({
  number: z.string().trim().min(1).max(60),
  issuedOn: isoDate,
  dueOn: isoDate.nullable(),
  amountMinor: minorUnits,
  currency,
  note: optionalText(1000),
});

/** One row of an uploaded list, as checked before anything is created. */
interface ListRow {
  line: number;
  fullName: string;
  phone: string;
  email: string | null;
  customerRef: string | null;
  status: "new" | "existing" | "error";
  message: string | null;
}

export function clientRoutes(deps: { db: Db; clock: () => Date }) {
  const { db } = deps;
  const app = new Hono<AdminEnv>();
  const today = () => toLagos(deps.clock()).date;

  const clientOr404 = async (tx: Db | Tx, id: string) => {
    const [client] = await tx.select().from(clientAccounts).where(and(eq(clientAccounts.id, id), isNull(clientAccounts.deletedAt)));
    if (!client) fail(404, "not_found", "Client not found");
    return client;
  };

  /** The seat's plan and dates: given, else the contract's, else the plan's season. */
  const seatTerms = async (tx: Db | Tx, client: typeof clientAccounts.$inferSelect, terms: z.infer<typeof SeatTerms>) => {
    const [plan] = await tx.select().from(plans).where(eq(plans.id, terms.planId));
    if (!plan) fail(422, "unknown_plan", "Plan not found");
    const startsOn = terms.startsOn ?? client.contractStartsOn ?? plan.seasonStartsOn ?? today();
    const endsOn = terms.endsOn ?? client.contractEndsOn ?? plan.seasonEndsOn;
    if (!endsOn) fail(400, "dates_required", "Give the passes an end date, or set the contract's dates");
    if (endsOn < startsOn) fail(400, "invalid_dates", "The end date is before the start date");
    if (endsOn < today()) fail(400, "dates_past", "These passes would already have ended");
    return { planId: plan.id, startsOn, endsOn };
  };

  /** Refuses more seats than the contract allows. */
  const checkSeatLimit = async (tx: Db | Tx, client: typeof clientAccounts.$inferSelect, adding: number) => {
    if (client.seats === null) return;
    const [row] = await tx.select({ n: count() }).from(clientSeats).where(eq(clientSeats.clientAccountId, client.id));
    if ((row?.n ?? 0) + adding > client.seats) fail(422, "seat_limit", `The contract allows ${client.seats} passes; ${row?.n ?? 0} are set up already`);
  };

  /** Gives an open seat to a person: finds them by phone (or adds them), starts their pass and grants its allowances. */
  const assign = async (tx: Tx, staff: StaffContext, client: typeof clientAccounts.$inferSelect, seat: typeof clientSeats.$inferSelect, person: z.infer<typeof Person>) => {
    if (seat.membershipId) fail(409, "seat_taken", "Someone already holds this pass; remove them first");
    const startsOn = seat.startsOn > today() ? seat.startsOn : today();
    if (startsOn > seat.endsOn) fail(422, "seat_ended", "This pass has ended");
    let [member] = await tx.select().from(members).where(eq(members.phone, person.phone));
    if (member) {
      const [held] = await tx
        .select({ id: clientSeats.id })
        .from(clientSeats)
        .innerJoin(memberships, eq(memberships.id, clientSeats.membershipId))
        .where(and(eq(clientSeats.clientAccountId, client.id), eq(memberships.memberId, member.id)));
      if (held) fail(409, "already_has_pass", `${member.fullName} already has a pass from ${client.name}`);
    } else {
      member = one(await tx.insert(members).values({ fullName: person.fullName, phone: person.phone, email: person.email ?? null, isTest: client.isTest }).returning());
      await staffAudit(tx, staff, "member.created", "member", member.id, null, member);
    }
    const membership = one(
      await tx
        .insert(memberships)
        .values({ memberId: member.id, planId: seat.planId, startsOn, endsOn: seat.endsOn, status: "active", paymentSource: "client", clientAccountId: client.id })
        .returning(),
    );
    await staffAudit(tx, staff, "membership.created", "membership", membership.id, null, { ...membership, clientSeatId: seat.id });
    await grantAllowances(tx, membership.id, { type: "staff", id: staff.id });
    const after = one(await tx.update(clientSeats).set({ membershipId: membership.id, customerRef: person.customerRef ?? null, assignedAt: deps.clock() }).where(eq(clientSeats.id, seat.id)).returning());
    await staffAudit(tx, staff, "client_seat.assigned", "client_seat", seat.id, seat, after);
    return member;
  };

  const loadClient = async (id: string) => {
    const client = await clientOr404(db, id);
    const seats = await db
      .select({
        id: clientSeats.id,
        startsOn: clientSeats.startsOn,
        endsOn: clientSeats.endsOn,
        customerRef: clientSeats.customerRef,
        assignedAt: clientSeats.assignedAt,
        plan: { id: plans.id, name: plans.name },
        membership: { id: memberships.id, status: memberships.status, startsOn: memberships.startsOn, endsOn: memberships.endsOn },
        member: { id: members.id, fullName: members.fullName, phone: members.phone },
      })
      .from(clientSeats)
      .innerJoin(plans, eq(plans.id, clientSeats.planId))
      .leftJoin(memberships, eq(memberships.id, clientSeats.membershipId))
      .leftJoin(members, eq(members.id, memberships.memberId))
      .where(eq(clientSeats.clientAccountId, id))
      .orderBy(sql`${clientSeats.membershipId} is null`, asc(members.fullName), asc(clientSeats.createdAt));
    const invoices = await db.select().from(clientInvoices).where(eq(clientInvoices.clientAccountId, id)).orderBy(desc(clientInvoices.issuedOn), desc(clientInvoices.createdAt));

    // Usage, as totals only: approved visits on passes this client paid for.
    const month = today().slice(0, 7);
    const used = and(eq(memberships.clientAccountId, id), eq(redemptions.result, "approved"), isNull(redemptions.deletedAt));
    const byService = await db
      .select({ name: categories.name, visits: count(), thisMonth: sql<number>`count(*) filter (where ${redemptions.serviceDate} >= ${`${month}-01`})`.mapWith(Number) })
      .from(redemptions)
      .innerJoin(memberships, eq(memberships.id, redemptions.membershipId))
      .innerJoin(categories, eq(categories.id, redemptions.categoryId))
      .where(used)
      .groupBy(categories.name)
      .orderBy(desc(count()));
    const [people] = await db
      .select({ n: sql<number>`count(distinct ${redemptions.memberId})`.mapWith(Number) })
      .from(redemptions)
      .innerJoin(memberships, eq(memberships.id, redemptions.membershipId))
      .where(and(used, gte(redemptions.serviceDate, `${month}-01`)));
    const assigned = seats.filter((s) => s.membership !== null).length;
    return {
      client,
      seats,
      invoices,
      usage: {
        seats: { total: seats.length, assigned, open: seats.length - assigned, limit: client.seats },
        visits: byService.reduce((n, s) => n + s.visits, 0),
        visitsThisMonth: byService.reduce((n, s) => n + s.thisMonth, 0),
        peopleThisMonth: people?.n ?? 0,
        byService,
      },
    };
  };

  app.get("/clients", requirePermission("clients.read"), async (c) => {
    const rows = await db
      .select({ client: clientAccounts, seats: sql<number>`count(${clientSeats.id})`.mapWith(Number), assigned: sql<number>`count(${clientSeats.membershipId})`.mapWith(Number) })
      .from(clientAccounts)
      .leftJoin(clientSeats, eq(clientSeats.clientAccountId, clientAccounts.id))
      .where(isNull(clientAccounts.deletedAt))
      .groupBy(clientAccounts.id)
      .orderBy(asc(clientAccounts.name));
    return c.json({ clients: rows.map(({ client, seats, assigned }) => ({ ...client, seatsSetUp: seats, seatsAssigned: assigned })) });
  });

  app.get("/clients/:id", requirePermission("clients.read"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    return c.json(await loadClient(id));
  });

  app.post("/clients", requirePermission("clients.write"), async (c) => {
    const input = await body(c, ClientFields.partial().required({ name: true }));
    const staff = c.get("staff");
    const row = await db.transaction(async (tx) => {
      const created = one(await tx.insert(clientAccounts).values(input).returning());
      await staffAudit(tx, staff, "client.created", "client_account", created.id, null, created);
      return created;
    });
    return c.json(await loadClient(row.id), 201);
  });

  app.patch("/clients/:id", requirePermission("clients.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, ClientFields.partial());
    const staff = c.get("staff");
    await db.transaction(async (tx) => {
      const before = await clientOr404(tx, id);
      const after = one(await tx.update(clientAccounts).set(input).where(eq(clientAccounts.id, id)).returning());
      await staffAudit(tx, staff, "client.updated", "client_account", id, before, after);
    });
    return c.json(await loadClient(id));
  });

  // Passes waiting for a name, e.g. 20 for a bank's launch; each is given out later.
  app.post("/clients/:id/seats", requirePermission("clients.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, SeatTerms.extend({ count: z.number().int().min(1).max(500) }));
    const staff = c.get("staff");
    await db.transaction(async (tx) => {
      const client = await clientOr404(tx, id);
      const terms = await seatTerms(tx, client, input);
      await checkSeatLimit(tx, client, input.count);
      const rows = await tx
        .insert(clientSeats)
        .values(Array.from({ length: input.count }, () => ({ clientAccountId: id, ...terms })))
        .returning();
      await staffAudit(tx, staff, "client_seats.created", "client_account", id, null, { count: rows.length, ...terms });
    });
    return c.json(await loadClient(id), 201);
  });

  // One person, with their own pass.
  app.post("/clients/:id/people", requirePermission("clients.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, Person.extend(SeatTerms.shape));
    const staff = c.get("staff");
    await db.transaction(async (tx) => {
      const client = await clientOr404(tx, id);
      if (!client.active) fail(422, "client_inactive", "This client is inactive");
      const terms = await seatTerms(tx, client, input);
      await checkSeatLimit(tx, client, 1);
      const seat = one(await tx.insert(clientSeats).values({ clientAccountId: id, ...terms }).returning());
      await assign(tx, staff, client, seat, input);
    });
    return c.json(await loadClient(id), 201);
  });

  // A list of people (CSV): checked first, then created together, like the pilot import.
  app.post("/clients/:id/people/upload", requirePermission("clients.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, SeatTerms.extend({ csv: z.string().min(1).max(2_000_000), commit: z.boolean() }));
    const staff = c.get("staff");
    const client = await clientOr404(db, id);
    const table = readTable(
      input.csv,
      { fullName: ["name", "full name", "customer name"], phone: ["phone", "mobile", "phone number", "mobile number"], email: ["email", "email address"], customerRef: ["customer ref", "customer id", "customer number", "reference"] },
      ["fullName", "phone"],
    );
    if (table.missing.length) fail(400, "missing_columns", `The list needs columns for: ${table.missing.map((m) => (m === "fullName" ? "name" : m)).join(", ")}`);
    if (table.records.length > 2000) fail(400, "too_many_rows", "Upload at most 2,000 people at a time");
    const rows: ListRow[] = [];
    const seen = new Set<string>();
    for (const r of table.records) {
      const fullName = r.get("fullName");
      const phone = normalisePhone(r.get("phone"));
      const email = r.get("email") || null;
      const row: ListRow = { line: r.line, fullName, phone: phone ?? r.get("phone"), email, customerRef: r.get("customerRef") || null, status: "new", message: null };
      if (!fullName && !r.get("phone")) continue;
      if (fullName.length < 2) row.message = "Name missing";
      else if (!phone) row.message = "Phone isn't in international format, e.g. +2348012345678";
      else if (email && !z.email().safeParse(email).success) row.message = "Email doesn't look right";
      else if (seen.has(phone)) row.message = "This phone is in the list twice";
      if (phone) seen.add(phone);
      rows.push(row);
    }
    const phones = rows.filter((r) => !r.message).map((r) => r.phone);
    if (phones.length) {
      const existing = await db.select({ id: members.id, phone: members.phone }).from(members).where(inArray(members.phone, phones));
      const holding = await db
        .select({ phone: members.phone })
        .from(clientSeats)
        .innerJoin(memberships, eq(memberships.id, clientSeats.membershipId))
        .innerJoin(members, eq(members.id, memberships.memberId))
        .where(and(eq(clientSeats.clientAccountId, id), inArray(members.phone, phones)));
      for (const row of rows) {
        if (row.message) continue;
        if (holding.some((h) => h.phone === row.phone)) row.message = `Already has a pass from ${client.name}`;
        else if (existing.some((m) => m.phone === row.phone)) row.status = "existing";
      }
    }
    for (const row of rows) if (row.message) row.status = "error";
    const ok = rows.filter((r) => r.status !== "error");
    const errors = rows.length - ok.length;
    let limitError: string | null = null;
    if (client.seats !== null) {
      const [row] = await db.select({ n: count() }).from(clientSeats).where(eq(clientSeats.clientAccountId, id));
      if ((row?.n ?? 0) + ok.length > client.seats) limitError = `The contract allows ${client.seats} passes; ${row?.n ?? 0} are set up and this list adds ${ok.length}`;
    }
    const report = { rows, counts: { new: ok.filter((r) => r.status === "new").length, existing: ok.filter((r) => r.status === "existing").length, errors }, limitError, ignoredColumns: table.ignored, committed: false };
    if (!input.commit) return c.json(report);
    if (errors || limitError || !ok.length) fail(422, "list_has_errors", "Fix the list's errors before adding these people");
    await db.transaction(async (tx) => {
      const fresh = await clientOr404(tx, id);
      const terms = await seatTerms(tx, fresh, input);
      await checkSeatLimit(tx, fresh, ok.length);
      for (const r of ok) {
        const seat = one(await tx.insert(clientSeats).values({ clientAccountId: id, ...terms }).returning());
        await assign(tx, staff, fresh, seat, { fullName: r.fullName, phone: r.phone, email: r.email, customerRef: r.customerRef });
      }
    });
    return c.json({ ...report, committed: true });
  });

  // An open seat gets a name.
  app.post("/client-seats/:id/assign", requirePermission("clients.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, Person);
    const staff = c.get("staff");
    const clientId = await db.transaction(async (tx) => {
      const [seat] = await tx.select().from(clientSeats).where(eq(clientSeats.id, id)).for("update");
      if (!seat) fail(404, "not_found", "Pass not found");
      const client = await clientOr404(tx, seat.clientAccountId);
      if (!client.active) fail(422, "client_inactive", "This client is inactive");
      await assign(tx, staff, client, seat, input);
      return client.id;
    });
    return c.json(await loadClient(clientId));
  });

  // Someone leaves: their pass ends today (or never starts) and the seat is free for someone else.
  app.post("/client-seats/:id/release", requirePermission("clients.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const { reason } = await body(c, z.object({ reason: z.string().trim().min(3).max(500) }));
    const staff = c.get("staff");
    const clientId = await db.transaction(async (tx) => {
      const [seat] = await tx.select().from(clientSeats).where(eq(clientSeats.id, id)).for("update");
      if (!seat) fail(404, "not_found", "Pass not found");
      if (!seat.membershipId) fail(409, "seat_open", "Nobody holds this pass");
      const [before] = await tx.select().from(memberships).where(eq(memberships.id, seat.membershipId)).for("update");
      if (before && (before.status === "active" || before.status === "suspended" || before.status === "pending")) {
        const notStarted = before.startsOn > today();
        const after = one(
          await tx
            .update(memberships)
            .set(notStarted ? { status: "cancelled" } : { status: "ended", endsOn: before.endsOn > today() ? today() : before.endsOn })
            .where(eq(memberships.id, before.id))
            .returning(),
        );
        await staffAudit(tx, staff, notStarted ? "membership.cancelled" : "membership.ended", "membership", before.id, before, { ...after, reason });
      }
      const freed = one(await tx.update(clientSeats).set({ membershipId: null, customerRef: null, assignedAt: null }).where(eq(clientSeats.id, id)).returning());
      await staffAudit(tx, staff, "client_seat.released", "client_seat", id, seat, { ...freed, reason });
      return seat.clientAccountId;
    });
    return c.json(await loadClient(clientId));
  });

  // An open seat that isn't needed any more.
  app.post("/client-seats/:id/remove", requirePermission("clients.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const staff = c.get("staff");
    const clientId = await db.transaction(async (tx) => {
      const [seat] = await tx.select().from(clientSeats).where(eq(clientSeats.id, id)).for("update");
      if (!seat) fail(404, "not_found", "Pass not found");
      if (seat.membershipId) fail(409, "seat_taken", "Someone holds this pass; remove them first");
      await tx.delete(clientSeats).where(eq(clientSeats.id, id));
      await staffAudit(tx, staff, "client_seat.removed", "client_seat", id, seat, null);
      return seat.clientAccountId;
    });
    return c.json(await loadClient(clientId));
  });

  app.post("/clients/:id/invoices", requirePermission("clients.invoices"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, InvoiceFields);
    if (input.dueOn && input.dueOn < input.issuedOn) fail(400, "invalid_dates", "The due date is before the issue date");
    const staff = c.get("staff");
    await db.transaction(async (tx) => {
      await clientOr404(tx, id);
      const [dup] = await tx.select({ id: clientInvoices.id }).from(clientInvoices).where(eq(clientInvoices.number, input.number));
      if (dup) fail(409, "duplicate_number", "An invoice with this number already exists");
      const created = one(await tx.insert(clientInvoices).values({ ...input, clientAccountId: id }).returning());
      await staffAudit(tx, staff, "client_invoice.created", "client_invoice", created.id, null, created);
    });
    return c.json(await loadClient(id), 201);
  });

  app.patch("/client-invoices/:id", requirePermission("clients.invoices"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, z.object({ status: z.enum(["issued", "paid", "void"]), paidOn: isoDate.nullable().optional(), note: optionalText(1000).optional() }));
    const staff = c.get("staff");
    const clientId = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(clientInvoices).where(eq(clientInvoices.id, id)).for("update");
      if (!before) fail(404, "not_found", "Invoice not found");
      const paidOn = input.status === "paid" ? (input.paidOn ?? today()) : null;
      const after = one(await tx.update(clientInvoices).set({ status: input.status, paidOn, ...(input.note !== undefined ? { note: input.note } : {}) }).where(eq(clientInvoices.id, id)).returning());
      await staffAudit(tx, staff, `client_invoice.${input.status === "paid" ? "paid" : input.status === "void" ? "voided" : "updated"}`, "client_invoice", id, before, after);
      return before.clientAccountId;
    });
    return c.json(await loadClient(clientId));
  });

  return app;
}

