"use client";
// A chauffeur or transfer listing's cars, and the car-and-driver picker the concierge uses on a booking.
import { Badge, Button, Card, Checkbox, EmptyState, Field, Icon, Input, Select, SidePanel, Table, Td } from "@intu/ui";
import { ActionForm, checked, intOrNull, text, textOrNull } from "@/components/forms";
import { api, useApi } from "@/lib/api";
import type { Assigned, Vehicle } from "@/lib/types";

function VehicleForm({ vehicle: v, venueId, onSaved }: { vehicle?: Vehicle; venueId: string; onSaved: () => void }) {
  return (
    <ActionForm
      action={async (form) => {
        const fields = { plate: text(form, "plate"), makeModel: text(form, "makeModel"), year: intOrNull(form, "year"), colour: textOrNull(form, "colour") };
        if (v) await api(`/admin/vehicles/${v.id}`, { method: "PATCH", body: { ...fields, active: checked(form, "active") } });
        else await api(`/admin/venues/${venueId}/vehicles`, { method: "POST", body: fields });
        onSaved();
      }}
    >
      {(busy) => (
        <>
          <Field label="Plate number" hint="As on the plate, e.g. LND 123 AB">
            <Input name="plate" required defaultValue={v?.plate ?? ""} autoCapitalize="characters" className="uppercase" />
          </Field>
          <Field label="Make and model" hint="e.g. Toyota Land Cruiser">
            <Input name="makeModel" required defaultValue={v?.makeModel ?? ""} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Year">
              <Input name="year" type="number" min={1980} max={2100} defaultValue={v?.year ?? ""} />
            </Field>
            <Field label="Colour">
              <Input name="colour" defaultValue={v?.colour ?? ""} placeholder="Black" />
            </Field>
          </div>
          {v ? <Checkbox name="active" defaultChecked={v.active} label="In service" hint="Retired cars stay on past visits and bookings, but drivers and the concierge can't pick them." /> : null}
          <Button type="submit" disabled={busy}>
            {v ? "Save vehicle" : "Add vehicle"}
          </Button>
        </>
      )}
    </ActionForm>
  );
}

export function VehiclesCard({ venueId, vehicles, writable, onChange }: { venueId: string; vehicles: Vehicle[]; writable: boolean; onChange: () => void }) {
  return (
    <Card
      title="Vehicles"
      description="The cars this listing uses. The concierge assigns one to each booking, and drivers pick theirs in the scanner."
      flush
      actions={
        writable ? (
          <SidePanel
            title="Add a vehicle"
            trigger={(open) => (
              <Button size="sm" tone="secondary" onClick={open}>
                <Icon name="plus" className="size-4" /> Add vehicle
              </Button>
            )}
          >
            {(close) => <VehicleForm venueId={venueId} onSaved={() => (onChange(), close())} />}
          </SidePanel>
        ) : null
      }
    >
      {vehicles.length === 0 ? (
        <EmptyState title="No vehicles">Add them for a chauffeur or transfer service.</EmptyState>
      ) : (
        <Table head={["Plate", "Car", "Status", ""]}>
          {vehicles.map((v) => (
            <tr key={v.id}>
              <Td className="whitespace-nowrap font-mono font-semibold">{v.plate}</Td>
              <Td>
                {v.makeModel}
                <span className="block text-xs text-muted">{[v.colour, v.year].filter(Boolean).join(" · ") || null}</span>
              </Td>
              <Td>
                <Badge dot tone={v.active ? "night" : "neutral"}>
                  {v.active ? "In service" : "Retired"}
                </Badge>
              </Td>
              <Td className="text-right">
                {writable ? (
                  <SidePanel
                    title={`Edit ${v.plate}`}
                    trigger={(open) => (
                      <Button size="sm" tone="ghost" onClick={open}>
                        Edit
                      </Button>
                    )}
                  >
                    {(close) => <VehicleForm vehicle={v} venueId={venueId} onSaved={() => (onChange(), close())} />}
                  </SidePanel>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

/** Car and driver selects for a booking at this listing; nothing when it has neither. */
export function AssignFields({ venueId, current }: { venueId: string; current?: Partial<Assigned> }) {
  const cars = useApi<{ vehicles: Vehicle[] }>(`/admin/venues/${venueId}`);
  const staff = useApi<{ staff: { id: string; fullName: string; active: boolean }[] }>(`/admin/venues/${venueId}/door-staff`);
  // Wait for both, so the selects start on the current car and driver.
  if (!cars.data || !staff.data) return <p className="text-sm text-muted">Loading the listing&apos;s cars…</p>;
  const inService = cars.data.vehicles.filter((v) => v.active);
  const drivers = staff.data.staff.filter((s) => s.active);
  if (!inService.length) return null;
  return (
    <>
      <Field label="Car" hint="The member sees it on their booking once confirmed.">
        <Select name="vehicleId" defaultValue={current?.vehicle?.id ?? ""}>
          <option value="">Not assigned yet</option>
          {inService.map((v) => (
            <option key={v.id} value={v.id}>
              {[v.colour, v.makeModel].filter(Boolean).join(" ")} · {v.plate}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Driver">
        <Select name="driverId" defaultValue={current?.driver?.id ?? ""}>
          <option value="">Not assigned yet</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.fullName}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

/** The car and driver from AssignFields' form, or nothing when the form had no car picker. */
export const readAssignment = (form: FormData) => (form.has("vehicleId") ? { vehicleId: textOrNull(form, "vehicleId"), driverId: textOrNull(form, "driverId") } : {});
