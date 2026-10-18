"use client";

// The actions at the top of a student's record, each in a dialog: editing
// the details, and changing the enrolment status.
import { FormDialog } from "@/components/forms/form-dialog";
import {
  type Returning,
  StatusChangeForm,
} from "@/components/students/status-change-form";
import {
  StudentForm,
  type StudentDetailsValues,
} from "@/components/students/student-form";
import type { CalendarDate } from "@/domain/college-time";
import {
  ENROLMENT_STATUS_LABELS,
  type EnrolmentStatus,
} from "@/domain/enrolment";
import type { ProgrammeOption } from "@/server/services/students";

export function EditDetailsDialog({
  studentNumber,
  details,
  programmes,
  academicYears,
  today,
  fixedPlacement,
}: {
  studentNumber: string;
  details: StudentDetailsValues;
  programmes: ProgrammeOption[];
  academicYears: string[];
  today: CalendarDate;
  /** A completed student's programme and years stay as they were. */
  fixedPlacement?: boolean;
}) {
  return (
    <FormDialog
      label="Edit details"
      title={`Edit ${details.fullName}`}
      description="The student ID stays the same, even if you change the academic year or programme."
      wide
    >
      {(close) => (
        <StudentForm
          mode="edit"
          studentNumber={studentNumber}
          defaultValues={details}
          programmes={programmes}
          academicYears={academicYears}
          today={today}
          fixedPlacement={fixedPlacement}
          onDone={close}
        />
      )}
    </FormDialog>
  );
}

export function ChangeStatusDialog({
  studentNumber,
  status,
  allowed,
  returning,
}: {
  studentNumber: string;
  status: EnrolmentStatus;
  allowed: readonly EnrolmentStatus[];
  /** For a student who can return to Enrolled. */
  returning?: Returning;
}) {
  return (
    <FormDialog
      label="Change status"
      title="Change status"
      description={`Currently ${ENROLMENT_STATUS_LABELS[status]}. Every change is kept in the status history.`}
      variant="default"
      disabled={allowed.length === 0}
    >
      {(close) => (
        // Remounts with the new options after each change.
        <StatusChangeForm
          key={status}
          studentNumber={studentNumber}
          allowed={allowed}
          returning={returning}
          onDone={close}
        />
      )}
    </FormDialog>
  );
}
