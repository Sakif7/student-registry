// The signed-in user's own account, for staff and students alike: their
// details, a new password, and the devices they are signed in on.
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { DevicesList } from "@/components/account/devices-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SESSION_HOURS } from "@/domain/accounts";
import { formatDateTime } from "@/lib/format";
import { collegeTimeZone } from "@/server/college";
import { getAccountDetails, listDevices } from "@/server/services/account";
import type { Session } from "@/server/session";

export async function AccountView({ session }: { session: Session }) {
  const [details, devices] = await Promise.all([
    getAccountDetails(session),
    listDevices(session),
  ]);
  const timeZone = collegeTimeZone();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Your details</h2>
          </CardTitle>
          <CardDescription>
            They come from the Registry&apos;s records.
            {session.role === "student" &&
              " To change them, contact the Registry."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
            {/* A pair stays together on a phone; beside each other, the
                pairs share the list's two columns. */}
            <div className="grid gap-0.5 sm:contents">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{details.name}</dd>
            </div>
            <div className="grid gap-0.5 sm:contents">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-all">{details.email}</dd>
            </div>
            <div className="grid gap-0.5 sm:contents">
              <dt className="text-muted-foreground">Account</dt>
              <dd>
                {details.studentNumber ? (
                  <>
                    Student ·{" "}
                    <span className="font-mono">{details.studentNumber}</span>
                  </>
                ) : (
                  "Registry staff"
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Change your password</h2>
          </CardTitle>
          <CardDescription>
            Changing it signs you out on every other device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm email={details.email} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>
            <h2>Where you&apos;re signed in</h2>
          </CardTitle>
          <CardDescription>
            Each sign-in lasts {SESSION_HOURS} hours. Sign out on a device you
            no longer use, or don&apos;t recognise.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DevicesList
            devices={devices.map((device) => ({
              id: device.id,
              device: device.device,
              ipAddress: device.ipAddress,
              signedInAt: formatDateTime(device.signedInAt, timeZone),
              current: device.current,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
