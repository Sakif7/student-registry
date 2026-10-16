"use client";

// The curriculum's actions, each in a dialog: setting up and changing
// programmes and modules, placing modules in a programme, and an academic
// year's calendar.
import { FormDialog } from "@/components/forms/form-dialog";
import type { Semester, SemesterDates } from "@/domain/curriculum";

import { AcademicYearForm } from "./academic-year-form";
import { ModuleForm, type ModuleDetails } from "./module-form";
import { type ProgrammeDetails, ProgrammeForm } from "./programme-form";
import { StructureModuleForm } from "./structure-module-form";

export function SetUpProgrammeDialog() {
  return (
    <FormDialog
      label="Set up a programme"
      title="Set up a programme"
      description="Its modules are added afterwards, year by year."
      variant="default"
    >
      {(close) => <ProgrammeForm onDone={close} />}
    </FormDialog>
  );
}

export function EditProgrammeDialog({
  programme,
}: {
  programme: ProgrammeDetails;
}) {
  return (
    <FormDialog
      label="Edit programme"
      title={`Edit ${programme.code}`}
      description="Its length and credits must still fit its modules and students."
    >
      {(close) => <ProgrammeForm programme={programme} onDone={close} />}
    </FormDialog>
  );
}

export function AddStructureModuleDialog({
  programmeCode,
  years,
  modules,
}: {
  programmeCode: string;
  years: number;
  modules: readonly {
    code: string;
    title: string;
    credits: number;
    semester: Semester;
  }[];
}) {
  return (
    <FormDialog
      label="Add a module"
      title={`Add a module to ${programmeCode}`}
      variant="default"
      disabled={modules.length === 0}
      wide
    >
      {(close) => (
        <StructureModuleForm
          programmeCode={programmeCode}
          years={years}
          modules={modules}
          onDone={close}
        />
      )}
    </FormDialog>
  );
}

export function SetUpModuleDialog() {
  return (
    <FormDialog
      label="Set up a module"
      title="Set up a module"
      description="It joins programmes from their pages."
      variant="default"
    >
      {(close) => <ModuleForm onDone={close} />}
    </FormDialog>
  );
}

export function EditModuleDialog({
  module,
  creditsLocked,
}: {
  module: ModuleDetails;
  creditsLocked: boolean;
}) {
  return (
    <FormDialog
      label={
        <>
          Edit<span className="sr-only"> {module.code}</span>
        </>
      }
      title={`Edit ${module.code}`}
    >
      {(close) => (
        <ModuleForm
          module={module}
          creditsLocked={creditsLocked}
          onDone={close}
        />
      )}
    </FormDialog>
  );
}

export function AcademicYearDialog({
  year,
  calendar,
}: {
  year: string;
  calendar?: SemesterDates & { studentsChooseModules: boolean };
}) {
  return (
    <FormDialog
      label={
        calendar ? (
          <>
            Edit<span className="sr-only"> {year}</span>
          </>
        ) : (
          `Set up ${year}`
        )
      }
      title={calendar ? `Edit ${year}` : `Set up ${year}`}
      description="Semester 1 and semester 2, one after the other, inside the academic year."
      variant={calendar ? "outline" : "default"}
    >
      {(close) => (
        <AcademicYearForm year={year} calendar={calendar} onDone={close} />
      )}
    </FormDialog>
  );
}
