// A student's record as read-only cards: their details and their enrolment
// status history. Used by the staff record page and the student's own page.
import type { ReactNode } from "react";

import { StatusBadge } from "@/components/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ENROLMENT_STATUS_LABELS } from "@/domain/enrolment";
import { ageOn } from "@/domain/students";
import { formatDate, formatDateTime } from "@/lib/format";
import type { StudentRecord } from "@/server/services/students";

export function StudentDetailsCard({
  student,
  today,
  timeZone,
}: {
  student: StudentRecord;
  today: string;
  timeZone: string;
}) {
  const rows: [string, ReactNode][] = [
    [
      "Student ID",
      <span key="id" className="font-mono">
        {student.studentNumber}
      </span>,
    ],
    ["Email", student.email],
    [
      "Date of birth",
      `${formatDate(student.dateOfBirth)} (age ${ageOn(student.dateOfBirth, today)})`,
    ],
    ["Programme", `${student.programme.title} (${student.programme.code})`],
    ["Academic year", student.academicYear],
    ["Status", <StatusBadge key="status" status={student.status} />],
    ["Record created", formatDateTime(student.enrolledAt, timeZone)],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Details</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export function StatusHistoryCard({
  student,
  timeZone,
}: {
  student: StudentRecord;
  timeZone: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Status history</h2>
        </CardTitle>
        <CardDescription>Every change, oldest first.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3">
          {student.statusHistory.map((change, index) => (
            <li key={index} className="grid gap-0.5">
              <span className="font-medium">
                {change.from === null
                  ? `Record created as ${ENROLMENT_STATUS_LABELS[change.to]}`
                  : `${ENROLMENT_STATUS_LABELS[change.from]} → ${ENROLMENT_STATUS_LABELS[change.to]}`}
              </span>
              <span className="text-muted-foreground">
                {formatDateTime(change.changedAt, timeZone)}
                {change.reason && ` · ${change.reason}`}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
