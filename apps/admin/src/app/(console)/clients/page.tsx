"use client";
// Clients: banks and fintechs (and later employers and promoters) paying for their people's passes.
import { Badge, Button, Card, EmptyState, formatDate, Icon, PageHeader, SidePanel, Table, Td } from "@intu/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CLIENT_KINDS, ClientForm } from "@/components/client-form";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import type { Client, ClientDetail } from "@/lib/types";

export default function ClientsPage() {
  const { can } = useStaff();
  const router = useRouter();
  const { data, error } = useApi<{ clients: Client[] }>("/admin/clients");

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Banks and fintechs paying for their customers' passes. Open one to add or remove people, see usage totals and record invoices."
        actions={
          can("clients.write") ? (
            <SidePanel
              title="New client"
              description="Add its people on the client's page next."
              trigger={(open) => (
                <Button onClick={open}>
                  <Icon name="plus" className="size-4" /> Add client
                </Button>
              )}
            >
              {() => (
                <ClientForm
                  submit="Add client"
                  onSave={async (fields) => {
                    const { client } = await api<ClientDetail>("/admin/clients", { method: "POST", body: fields });
                    router.push(`/clients/${client.id}`);
                  }}
                />
              )}
            </SidePanel>
          ) : null
        }
      />
      <Card flush>
        {error ? <p className="p-5 text-sm text-danger">{error}</p> : null}
        {data && data.clients.length === 0 ? (
          <EmptyState title="No clients yet">Add the first bank or fintech buying passes for its customers.</EmptyState>
        ) : (
          <Table head={["Client", "Contract", "Passes", "Status"]}>
            {data?.clients.map((c) => (
              <tr key={c.id}>
                <Td>
                  <Link href={`/clients/${c.id}`} className="font-semibold text-fg hover:text-accent">
                    {c.name}
                  </Link>
                  <span className="block text-xs text-muted">{[CLIENT_KINDS[c.kind], c.isTest ? "TEST" : null].filter(Boolean).join(" · ")}</span>
                </Td>
                <Td className="text-muted">{c.contractStartsOn && c.contractEndsOn ? `${formatDate(c.contractStartsOn)} – ${formatDate(c.contractEndsOn)}` : (c.contractRef ?? "–")}</Td>
                <Td className="tabular-nums">
                  {c.seatsAssigned ?? 0} given out
                  <span className="block text-xs text-muted">
                    {c.seatsSetUp ?? 0} set up{c.seats !== null ? ` of ${c.seats}` : ""}
                  </span>
                </Td>
                <Td>
                  <Badge dot tone={c.active ? "night" : "neutral"}>
                    {c.active ? "Active" : "Inactive"}
                  </Badge>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
