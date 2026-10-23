"use client";
// A chauffeur or transfer listing's cars, and the car-and-driver picker the concierge uses on a booking.
import { Badge, Button, Card, Checkbox, EmptyState, Field, Icon, Input, Select, SidePanel, Table, Td } from "@intu/ui";
import { ActionForm, checked, intOrNull, text, textOrNull } from "@/components/forms";
import { useState } from "react";
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

const PLATE = /^[A-Z0-9][A-Z0-9 -]{1,13}$/;

/** Car rows on the Add listing form, for a chauffeur or transfer service: added with the listing. */
export function NewCarsFields() {
  const [rows, setRows] = useState(1);
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-semibold">Cars</legend>
      <p className="text-sm text-muted">Add each car the service uses. You can add more, or retire them, on the listing&apos;s page later. Drivers are added there too.</p>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid grid-cols-2 gap-3 border-t border-line pt-3 first-of-type:border-0 first-of-type:pt-0">
          <Field label={rows > 1 ? `Car ${i + 1}: plate number` : "Plate number"} hint="e.g. LND 123 AB">
            <Input name={`car_plate_${i}`} className="uppercase" />
          </Field>
          <Field label={rows > 1 ? `Car ${i + 1}: make and model` : "Make and model"} hint="e.g. Toyota Land Cruiser">
            <Input name={`car_makeModel_${i}`} />
          </Field>
          <Field label={rows > 1 ? `Car ${i + 1}: year` : "Year"}>
            <Input name={`car_year_${i}`} type="number" min={1980} max={2100} />
          </Field>
          <Field label={rows > 1 ? `Car ${i + 1}: colour` : "Colour"}>
            <Input name={`car_colour_${i}`} placeholder="Black" />
          </Field>
        </div>
      ))}
      <Button type="button" size="sm" tone="ghost" onClick={() => setRows((n) => n + 1)}>
        <Icon name="plus" className="size-4" /> Add another car
      </Button>
    </fieldset>
  );
}

/** The cars from NewCarsFields; rows left blank are skipped. Throws on a half-filled or bad row. */
export function readCars(form: FormData) {
  const cars: { plate: string; makeModel: string; year: number | null; colour: string | null }[] = [];
  for (let i = 0; form.has(`car_plate_${i}`); i++) {
    const plate = text(form, `car_plate_${i}`).toUpperCase().replace(/\s+/g, " ");
    const makeModel = text(form, `car_makeModel_${i}`);
    if (!plate && !makeModel) continue;
    if (!PLATE.test(plate)) throw new Error(`Car ${i + 1}: enter the plate number, e.g. LND 123 AB`);
    if (makeModel.length < 2) throw new Error(`Car ${i + 1}: enter the make and model, e.g. Toyota Land Cruiser`);
    cars.push({ plate, makeModel, year: intOrNull(form, `car_year_${i}`), colour: textOrNull(form, `car_colour_${i}`) });
  }
  return cars;
}
