// Module registration: which modules a student takes in an academic year.
// The core modules of their programme's year of study are registered
// automatically; optional ones are added by staff, or by the student while
// the academic year lets students choose, within the credits a year carries.
// Work submitted for a module, and marks, keep its registration in place.
import type { EnrolmentStatus } from "./enrolment";
import type { ModuleKind } from "./curriculum";

/** A module the student is registered on in the academic year. */
export interface Registered {
  moduleId: string;
  credits: number;
  /** The student has submitted work, or has a mark, for it that year. */
  hasWork: boolean;
}

/**
 * What registering a student for their programme and year of study changes:
 * the core modules they lack are added, and modules outside the year's
 * structure are dropped, unless the student has work for them. Optional
 * modules in the structure stay as they are.
 *
 * @param structure - The modules of the student's programme in their year of
 *   study.
 * @param registered - The student's registrations for the academic year.
 */
export function registrationChanges(
  structure: readonly { moduleId: string; kind: ModuleKind }[],
  registered: readonly Registered[],
): { add: string[]; drop: string[] } {
  const inStructure = new Set(structure.map((entry) => entry.moduleId));
  const isRegistered = new Set(registered.map((entry) => entry.moduleId));
  return {
    add: structure
      .filter(
        (entry) => entry.kind === "CORE" && !isRegistered.has(entry.moduleId),
      )
      .map((entry) => entry.moduleId),
    drop: registered
      .filter((entry) => !inStructure.has(entry.moduleId) && !entry.hasWork)
      .map((entry) => entry.moduleId),
  };
}

/** Why a student can't be registered on a module. */
export type RegistrationRefusal =
  "NOT_ENROLLED" | "NOT_IN_PROGRAMME" | "ALREADY_REGISTERED" | "OVER_CREDITS";

/**
 * Decides whether a student can be registered on a module: they must be
 * enrolled, the module must be in their programme's structure for their
 * year of study, and the year's credits must not be exceeded.
 */
export function checkRegistration(input: {
  status: EnrolmentStatus;
  /** The module's place in the student's year, or null if it has none. */
  kind: ModuleKind | null;
  alreadyRegistered: boolean;
  registeredCredits: number;
  moduleCredits: number;
  creditsPerYear: number;
}): { allowed: true } | { allowed: false; reason: RegistrationRefusal } {
  if (input.status !== "ENROLLED") {
    return { allowed: false, reason: "NOT_ENROLLED" };
  }
  if (input.kind === null) {
    return { allowed: false, reason: "NOT_IN_PROGRAMME" };
  }
  if (input.alreadyRegistered) {
    return { allowed: false, reason: "ALREADY_REGISTERED" };
  }
  if (input.registeredCredits + input.moduleCredits > input.creditsPerYear) {
    return { allowed: false, reason: "OVER_CREDITS" };
  }
  return { allowed: true };
}

/** Why a registration can't be dropped. */
export type DropRefusal = "CORE" | "HAS_WORK";

/**
 * Decides whether a registration can be dropped: not a core module of the
 * student's year, which every student takes, and not one the student has
 * submitted work or has a mark for, which stay on their record.
 */
export function checkDrop(input: {
  /** The module's place in the student's year, or null if it has none. */
  kind: ModuleKind | null;
  hasWork: boolean;
}): { allowed: true } | { allowed: false; reason: DropRefusal } {
  if (input.kind === "CORE") return { allowed: false, reason: "CORE" };
  if (input.hasWork) return { allowed: false, reason: "HAS_WORK" };
  return { allowed: true };
}

/** The credits of the modules a student is registered on. */
export function registeredCredits(
  registered: readonly { credits: number }[],
): number {
  return registered.reduce((total, entry) => total + entry.credits, 0);
}

/** What a refused registration says, with the credits involved. */
export function registrationRefusalMessage(
  reason: RegistrationRefusal,
  credits: { registered: number; module: number; perYear: number },
): string {
  switch (reason) {
    case "NOT_ENROLLED":
      return "Only enrolled students can be registered on modules.";
    case "NOT_IN_PROGRAMME":
      return "This module isn't part of the programme in this year of study.";
    case "ALREADY_REGISTERED":
      return "Already registered on this module this year.";
    case "OVER_CREDITS":
      return `That would make ${credits.registered + credits.module} credits this year, more than the ${credits.perYear} a year carries.`;
  }
}

export const DROP_REFUSAL_MESSAGES: Record<DropRefusal, string> = {
  CORE: "Core modules can't be dropped: every student in the year takes them.",
  HAS_WORK:
    "Work has been submitted or marked for this module, so it stays on the record.",
};
