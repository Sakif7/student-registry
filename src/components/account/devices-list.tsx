"use client";

// The devices the signed-in user is signed in on, with a way to sign out on
// any other one, or on all of them at once.
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError, apiRequest } from "@/lib/api-client";
import { refreshAfterWrite } from "@/server/actions";

/** A signed-in device, with its time formatted for display. */
export interface DeviceRow {
  id: string;
  device: string;
  ipAddress: string | null;
  signedInAt: string;
  current: boolean;
}

export function DevicesList({ devices }: { devices: DeviceRow[] }) {
  const [busy, setBusy] = useState(false);
  const others = devices.filter((device) => !device.current).length;

  async function act(action: () => Promise<string>) {
    setBusy(true);
    try {
      toast.success(await action());
      await refreshAfterWrite();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  const signOut = (row: DeviceRow) =>
    act(async () => {
      await apiRequest("DELETE", `/api/account/sessions/${row.id}`);
      return `Signed out on ${row.device}.`;
    });

  const signOutOthers = () =>
    act(async () => {
      const { signedOutDevices } = await apiRequest<{
        signedOutDevices: number;
      }>("DELETE", "/api/account/sessions");
      return `Signed out on ${signedOutDevices} other ${signedOutDevices === 1 ? "device" : "devices"}.`;
    });

  return (
    <div className="grid gap-4">
      <ul className="grid divide-y rounded-lg border">
        {devices.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm"
          >
            <div className="grid gap-0.5">
              <p className="flex items-center gap-2 font-medium">
                {row.device}
                {row.current && (
                  <Badge className="border-transparent bg-emerald-100 text-emerald-900">
                    This device
                  </Badge>
                )}
              </p>
              <p className="text-muted-foreground">
                Signed in {row.signedInAt}
                {row.ipAddress && ` · ${row.ipAddress}`}
              </p>
            </div>
            {!row.current && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void signOut(row)}
              >
                Sign out<span className="sr-only"> on {row.device}</span>
              </Button>
            )}
          </li>
        ))}
      </ul>
      {others > 0 && (
        <Button
          variant="outline"
          className="justify-self-start"
          disabled={busy}
          onClick={() => void signOutOthers()}
        >
          Sign out on every other device
        </Button>
      )}
    </div>
  );
}
