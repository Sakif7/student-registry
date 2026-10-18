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
  /**
   * The student has submitted work, or has a mark, for it that year, or one
   * of its deadlines passed while they were on it: it stays, either way.
   */
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
export type DropRefusal = "NOT_ENROLLED" | "CORE" | "HAS_WORK" | "WAS_DUE";

/**
 * Decides whether a registration can be dropped: the student must be
 * enrolled, as only an enrolled student's modules change, and it must not
 * be a core module of their year, which every student takes, nor one they
 * have submitted work or have a mark for, which stays on their record. Nor
 * can it go once one of its deadlines has passed while they were on it:
 * they were expected to submit, and dropping it would erase the missed work.
 */
export function checkDrop(input: {
  status: EnrolmentStatus;
  /** The module's place in the student's year, or null if it has none. */
  kind: ModuleKind | null;
  hasWork: boolean;
  /** One of its deadlines that year passed while they were registered. */
  wasDue: boolean;
}): { allowed: true } | { allowed: false; reason: DropRefusal } {
  if (input.status !== "ENROLLED") {
    return { allowed: false, reason: "NOT_ENROLLED" };
  }
  if (input.kind === "CORE") return { allowed: false, reason: "CORE" };
  if (input.hasWork) return { allowed: false, reason: "HAS_WORK" };
  if (input.wasDue) return { allowed: false, reason: "WAS_DUE" };
  return { allowed: true };
}

/** The credits of the modules a student is registered on. */
export function registeredCredits(
  registered: readonly { credits: number }[],
): number {
  return registered.reduce((total, entry) => total + entry.credits, 0);
}

/**
 * Where a student's registered credits stand against what their year
 * carries: short (with the credits still to choose), full, or over. Over can
 * happen: a core module added to a year after students chose their options
 * is still registered when they are next registered, as every student in the
 * year takes it, and staff then drop an option.
 */
export function creditStanding(
  registered: number,
  perYear: number,
): { kind: "short" | "full" | "over"; credits: number } {
  if (registered < perYear) {
    return { kind: "short", credits: perYear - registered };
  }
  if (registered > perYear) {
    return { kind: "over", credits: registered - perYear };
  }
  return { kind: "full", credits: 0 };
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
  NOT_ENROLLED: "Only an enrolled student's modules can change.",
  CORE: "Core modules can't be dropped: every student in the year takes them.",
  HAS_WORK:
    "Work has been submitted or marked for this module, so it stays on the record.",
  WAS_DUE:
    "One of this module's deadlines has passed, so it stays on the record.",
};

/**
 * What a student is told when a module can't be dropped because of a mark
 * they can't see yet: naming the reason would tell them the mark exists.
 */
export const DROP_REFUSED_WITHOUT_REASON =
  "This module can't be dropped just now. Contact the Registry to change it.";
