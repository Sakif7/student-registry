// Where a student stands, at the top of their record: status, modules, fees,
// results and sign-in, each opening the tab that explains it.
import {
  Banknote,
  BookOpen,
  GraduationCap,
  IdCard,
  KeyRound,
} from "lucide-react";

import { type SummaryFact, SummaryStrip } from "@/components/summary-strip";
import type { Tone } from "@/components/tone";
import { SIGN_IN_STATE_LABELS, type SignInState } from "@/domain/accounts";
import {
  ENROLMENT_STATUS_LABELS,
  type EnrolmentStatus,
} from "@/domain/enrolment";
import { nextChargeDue } from "@/domain/fees";
import { creditStanding } from "@/domain/registration";
import {
  formatCount,
  formatDate,
  formatDateOf,
  formatMoney,
} from "@/lib/format";
import type { Account } from "@/server/services/fees";
import type { StudentModules } from "@/server/services/registrations";
import type { StudentResults } from "@/server/services/results";
import type { StudentSignIn } from "@/server/services/sign-in";
import type { StudentRecord } from "@/server/services/students";

const STATUS_TONES: Record<EnrolmentStatus, Tone> = {
  ENROLLED: "positive",
  DEFERRED: "attention",
  WITHDRAWN: "neutral",
  COMPLETED: "info",
};

const SIGN_IN_TONES: Record<SignInState, Tone> = {
  ACTIVE: "positive",
  PENDING: "attention",
  DISABLED: "neutral",
};

export function RecordSummary({
  student,
  modules,
  account,
  results,
  signIn,
  timeZone,
}: {
  student: StudentRecord;
  modules: StudentModules;
  account: Account;
  results: StudentResults;
  signIn: StudentSignIn;
  timeZone: string;
}) {
  return (
    <SummaryStrip
      facts={[
        statusFact(student, timeZone),
        modulesFact(student.status, modules),
        feesFact(account),
        resultsFact(results),
        signInFact(signIn, timeZone),
      ]}
    />
  );
}

function statusFact(student: StudentRecord, timeZone: string): SummaryFact {
  const since = student.statusHistory.reduce(
    (latest, change) => (change.changedAt > latest ? change.changedAt : latest),
    student.enrolledAt,
  );
  return {
    label: "Status",
    icon: IdCard,
    value: ENROLMENT_STATUS_LABELS[student.status],
    tone: STATUS_TONES[student.status],
    detail: `Since ${formatDateOf(since, timeZone)}`,
    link: { tab: "overview" },
  };
}

function modulesFact(
  status: EnrolmentStatus,
  modules: StudentModules,
): SummaryFact {
  const standing = creditStanding(
    modules.registeredCredits,
    modules.creditsPerYear,
  );
  const enrolled = status === "ENROLLED";
  return {
    label: "Modules",
    icon: BookOpen,
    value: (
      <>
        <span className="whitespace-nowrap">
          {modules.registeredCredits} of {modules.creditsPerYear}
        </span>{" "}
        credits
      </>
    ),
    tone: !enrolled
      ? "neutral"
      : standing.kind === "full"
        ? "positive"
        : "attention",
    progress: { value: modules.registeredCredits, max: modules.creditsPerYear },
    detail:
      standing.kind === "over"
        ? `${standing.credits} credits over the year's ${modules.creditsPerYear}`
        : enrolled && standing.kind === "short"
          ? `${standing.credits} credits to choose`
          : `Year ${modules.yearOfStudy}, ${modules.academicYear}`,
    link: { tab: "modules" },
  };
}

function feesFact(account: Account): SummaryFact {
  const { summary } = account;
  const fact = { label: "Fees", icon: Banknote, link: { tab: "fees" } };
  switch (account.standing) {
    case "OVERDUE":
      return {
        ...fact,
        value: `${formatMoney(summary.overduePence)} overdue`,
        tone: "negative",
        detail:
          summary.overdueSince && `Since ${formatDate(summary.overdueSince)}`,
      };
    case "DUE": {
      const next = nextChargeDue(account.charges);
      return {
        ...fact,
        value: `${formatMoney(summary.balancePence)} due`,
        tone: "attention",
        detail: next && `Next due ${formatDate(next.dueDate)}`,
      };
    }
    case "PAID":
      return {
        ...fact,
        value: "Paid in full",
        tone: "positive",
        detail: "Nothing to pay",
      };
    case "CREDIT":
      return {
        ...fact,
        value: `${formatMoney(-summary.balancePence)} in credit`,
        tone: "info",
        detail: "Paid more than charged",
      };
    case "NONE":
      return {
        ...fact,
        value: "No fees",
        tone: "neutral",
        // A charge corrected to £0, e.g. a full scholarship, is still a charge.
        detail:
          account.charges.length > 0 ? "Fees waived" : "Nothing charged yet",
      };
  }
}

function resultsFact(results: StudentResults): SummaryFact {
  const fact = {
    label: "Results",
    icon: GraduationCap,
    link: { tab: "results" },
  };
  const total = results.results.length;
  const unpublished = results.results.filter((r) => !r.publishedAt).length;
  if (results.withheld) {
    return {
      ...fact,
      value: "Withheld",
      tone: "attention",
      detail: results.withheld.reason,
    };
  }
  if (unpublished > 0) {
    return {
      ...fact,
      value: `${unpublished} to publish`,
      tone: "attention",
      detail:
        unpublished === total
          ? "None published yet"
          : `${total - unpublished} published`,
    };
  }
  return total > 0
    ? {
        ...fact,
        value: "All published",
        tone: "positive",
        detail: formatCount(total, "mark"),
      }
    : {
        ...fact,
        value: "None yet",
        tone: "neutral",
        detail: "No marks entered",
      };
}

function signInFact(signIn: StudentSignIn, timeZone: string): SummaryFact {
  const date = (instant: Date) => formatDateOf(instant, timeZone);
  return {
    label: "Sign-in",
    icon: KeyRound,
    value: SIGN_IN_STATE_LABELS[signIn.state],
    tone: SIGN_IN_TONES[signIn.state],
    detail:
      signIn.state === "PENDING"
        ? signIn.link
          ? `Link works until ${date(signIn.link.expiresAt)}`
          : "Needs a new link"
        : signIn.state === "ACTIVE"
          ? signIn.activatedAt && `Activated ${date(signIn.activatedAt)}`
          : signIn.disabledAt && `Since ${date(signIn.disabledAt)}`,
    link: { tab: "sign-in" },
  };
}
