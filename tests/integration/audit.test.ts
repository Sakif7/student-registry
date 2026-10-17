// The audit trail: every change records who made it, in the same
// transaction, and nothing else can rewrite it. Services are called directly,
// as the signed-in staff member or student.
import { describe, expect, it } from "vitest";

import { GET as getActivity } from "@/app/api/activity/route";
import { GET as getHistory } from "@/app/api/students/[studentNumber]/history/route";
import { db } from "@/server/db";
import { listActivity } from "@/server/services/activity";
import {
  createAssessment,
  saveMarks,
  updateAssessment,
} from "@/server/services/assessments";
import {
  assignFee,
  correctFee,
  recordPayment,
  reversePayment,
} from "@/server/services/fees";
import {
  liftResultsHold,
  publishResults,
  withholdResults,
} from "@/server/services/results";
import { sendSignInLink, setSignInEnabled } from "@/server/services/sign-in";
import {
  changeStatus,
  createStudent,
  updateStudent,
} from "@/server/services/students";
import { submitWork } from "@/server/services/submissions";

import { samplePdf } from "../../prisma/sample-documents";
import {
  createAssessment as makeAssessment,
  createModule,
  createProgramme,
  createStudent as makeStudent,
  registerStudents,
} from "../helpers/factories";
import {
  apiRequest,
  asStudent,
  bodyOf,
  routeContext,
  sessionFor,
  STAFF,
  type Viewer,
} from "../helpers/requests";

/** Past, so its assessments can be marked; in 2026/27, like the students. */
const PAST_DEADLINE = new Date("2026-10-08T16:00:00.000Z");

/** The events recorded so far, oldest first, as tests compare them. */
async function events() {
  const rows = await db().auditEvent.findMany({
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    include: { actor: { select: { name: true } } },
  });
  return rows.map(({ action, details, studentId, actor }) => ({
    action,
    details,
    studentId,
    actor: actor.name,
  }));
}

/** A programme with the BSC-CS code, and an enrolled student on it. */
async function enrolledStudent() {
  const programme = await createProgramme({ code: "BSC-CS" });
  const student = await makeStudent({
    studentNumber: "SMS-2026-0001",
    fullName: "Oliver Bennett",
    programmeId: programme.id,
  });
  return { programme, student };
}

describe("the audit trail records", () => {
  it("who enrolled a student, the fee charged with it, and the activation email sent", async () => {
    await createProgramme({ code: "BSC-CS" });
    const staff = await sessionFor(STAFF);

    const student = await createStudent(staff, {
      fullName: "Grace Thompson",
      email: "grace.thompson@student.example",
      dateOfBirth: "2005-03-12",
      programmeCode: "BSC-CS",
      academicYear: "2026/27",
    });
    await sendSignInLink(staff, student.studentNumber);

    expect(await events()).toMatchObject([
      {
        action: "student.enrolled",
        actor: "Rachel Moss",
        details: { studentNumber: student.studentNumber, status: "ENROLLED" },
      },
      {
        action: "fee.charged",
        actor: "Rachel Moss",
        details: { academicYear: "2026/27", amountPence: 953_500 },
      },
      {
        action: "sign_in.link_sent",
        actor: "Rachel Moss",
        details: { kind: "activation" },
      },
    ]);
  });

  it("which details an edit changed, and nothing for an edit that changed none", async () => {
    const { student } = await enrolledStudent();
    const staff = await sessionFor(STAFF);

    await updateStudent(staff, student.studentNumber, {
      fullName: student.fullName,
      email: "oliver.j.bennett@student.example",
    });
    await updateStudent(staff, student.studentNumber, {
      fullName: student.fullName,
    });

    expect(await events()).toMatchObject([
      {
        action: "student.edited",
        studentId: student.id,
        details: { fields: ["email"] },
      },
    ]);
  });

  it("status changes, with the reason", async () => {
    const { student } = await enrolledStudent();
    const staff = await sessionFor(STAFF);

    await changeStatus(staff, student.studentNumber, {
      status: "DEFERRED",
      reason: "Medical grounds",
    });

    expect(await events()).toMatchObject([
      {
        action: "student.status_changed",
        studentId: student.id,
        details: {
          from: "ENROLLED",
          to: "DEFERRED",
          reason: "Medical grounds",
        },
      },
    ]);
  });

  it("fees charged and corrected, and payments recorded and reversed", async () => {
    const { student } = await enrolledStudent();
    const staff = await sessionFor(STAFF);

    const charged = await assignFee(staff, student.studentNumber, {
      academicYear: "2026/27",
    });
    const feeId = charged.charges[0]?.id ?? "";
    await correctFee(staff, feeId, {
      amountPence: 0,
      dueDate: "2026-11-30",
      note: "Scholarship",
    });
    const paid = await recordPayment(staff, student.studentNumber, {
      amountPence: 50_000,
      paidOn: "2026-10-01",
      reference: "BACS 0042",
    });
    await reversePayment(staff, paid.payments[0]?.id ?? "", {
      reason: "Keyed against the wrong student",
    });

    expect(
      (await events()).map(({ action, details }) => [action, details]),
    ).toEqual([
      ["fee.charged", { academicYear: "2026/27", amountPence: 953_500 }],
      [
        "fee.corrected",
        {
          academicYear: "2026/27",
          amountPence: 0,
          dueDate: "2026-11-30",
          from: {
            amountPence: 953_500,
            dueDate: charged.charges[0]?.dueDate,
          },
          note: "Scholarship",
        },
      ],
      ["payment.recorded", { amountPence: 50_000, reference: "BACS 0042" }],
      [
        "payment.reversed",
        {
          amountPence: 50_000,
          reference: "BACS 0042",
          reason: "Keyed against the wrong student",
        },
      ],
    ]);
  });

  it("assessments set, edited, closed and reopened, for no one student", async () => {
    const programme = await createProgramme({ code: "BSC-CS" });
    await createModule({
      code: "CS4002",
      title: "Databases",
      programmeId: programme.id,
    });
    const staff = await sessionFor(STAFF);
    const deadline = new Date(Date.now() + 14 * 86_400_000)
      .toISOString()
      .slice(0, 16);

    const set = await createAssessment(staff, {
      moduleCode: "CS4002",
      title: "SQL lab test",
      deadline,
    });
    await updateAssessment(staff, set.id, { title: "SQL lab test 1" });
    await updateAssessment(staff, set.id, { closed: true });
    await updateAssessment(staff, set.id, { closed: true });
    await updateAssessment(staff, set.id, { closed: false });

    const details = { assessmentId: set.id, title: "SQL lab test 1" };
    expect(await events()).toMatchObject([
      {
        action: "assessment.set",
        studentId: null,
        details: {
          assessmentId: set.id,
          title: "SQL lab test",
          moduleCode: "CS4002",
        },
      },
      {
        action: "assessment.edited",
        details: {
          ...details,
          changes: { title: { from: "SQL lab test", to: "SQL lab test 1" } },
        },
      },
      { action: "assessment.closed", details },
      { action: "assessment.reopened", details },
    ]);
  });

  it("each mark entered, changed or removed", async () => {
    const { student } = await enrolledStudent();
    const assessment = await makeAssessment({
      title: "Essay",
      deadline: PAST_DEADLINE,
    });
    await registerStudents(assessment.moduleId, [student.id]);
    const staff = await sessionFor(STAFF);
    const marks = (mark: number | null) => ({
      marks: { [student.studentNumber]: mark },
    });

    await saveMarks(staff, assessment.id, marks(72));
    await saveMarks(staff, assessment.id, marks(72));
    await saveMarks(staff, assessment.id, marks(68));
    await saveMarks(staff, assessment.id, marks(null));

    expect(
      (await events()).map(
        ({ details }) => details as { from: unknown; to: unknown },
      ),
    ).toMatchObject([
      { from: null, to: 72 },
      { from: 72, to: 68 },
      { from: 68, to: null },
    ]);
  });

  it("publications, holds and lifted holds, but not publishing nothing", async () => {
    const { student } = await enrolledStudent();
    const assessment = await makeAssessment({ deadline: PAST_DEADLINE });
    await registerStudents(assessment.moduleId, [student.id]);
    const staff = await sessionFor(STAFF);
    await saveMarks(staff, assessment.id, {
      marks: { [student.studentNumber]: 72 },
    });

    await publishResults(staff, student.studentNumber);
    await publishResults(staff, student.studentNumber);
    await withholdResults(staff, student.studentNumber, {
      reason: "Outstanding tuition fees",
    });
    await liftResultsHold(staff, student.studentNumber);
    await liftResultsHold(staff, student.studentNumber);

    expect((await events()).map(({ action }) => action)).toEqual([
      "mark.saved",
      "results.published",
      "results.withheld",
      "results.hold_lifted",
    ]);
  });

  it("work a student submitted, with the student as the one who did it", async () => {
    const { student } = await enrolledStudent();
    const assessment = await makeAssessment({ title: "Essay" });
    await registerStudents(assessment.moduleId, [student.id]);
    const self = await sessionFor(asStudent(student.studentNumber));
    const pdf = new File(
      [new Uint8Array(samplePdf("Essay", ["Oliver Bennett"]))],
      "essay.pdf",
      { type: "application/pdf" },
    );

    await submitWork(self, assessment.id, pdf);

    expect(await events()).toMatchObject([
      {
        action: "work.submitted",
        actor: "Oliver Bennett",
        studentId: student.id,
        details: {
          assessmentId: assessment.id,
          title: "Essay",
          fileName: "essay.pdf",
          attempt: 1,
        },
      },
    ]);
  });

  it("sign-in turned off and on, only when it changes", async () => {
    const { student } = await enrolledStudent();
    const staff = await sessionFor(STAFF);
    const turn = (enabled: boolean) =>
      setSignInEnabled(staff, student.studentNumber, { enabled });

    await turn(true);
    await turn(false);
    await turn(false);
    await turn(true);

    expect((await events()).map(({ action }) => action)).toEqual([
      "sign_in.turned_off",
      "sign_in.turned_on",
    ]);
  });

  it("nothing for a change that failed", async () => {
    const { student } = await enrolledStudent();
    const staff = await sessionFor(STAFF);
    await recordPayment(staff, student.studentNumber, {
      amountPence: 50_000,
      paidOn: "2026-10-01",
      reference: "BACS 0042",
    });

    await expect(
      recordPayment(staff, student.studentNumber, {
        amountPence: 50_000,
        paidOn: "2026-10-01",
        reference: "BACS 0042",
      }),
    ).rejects.toThrow();
    await expect(
      changeStatus(staff, student.studentNumber, { status: "ENROLLED" }),
    ).rejects.toThrow();

    expect((await events()).map(({ action }) => action)).toEqual([
      "payment.recorded",
    ]);
  });
});

describe("the audit trail", () => {
  it("can't be changed or deleted, even directly in the database", async () => {
    const { student } = await enrolledStudent();
    await changeStatus(await sessionFor(STAFF), student.studentNumber, {
      status: "DEFERRED",
      reason: "Medical grounds",
    });

    await expect(
      db().$executeRaw`UPDATE audit_events SET action = 'student.edited'`,
    ).rejects.toThrow(/append-only/);
    await expect(db().$executeRaw`DELETE FROM audit_events`).rejects.toThrow(
      /append-only/,
    );
    expect(await db().auditEvent.count()).toBe(1);
  });

  it("lists every change, newest first, a page at a time, for staff only", async () => {
    const { student } = await enrolledStudent();
    const staff = await sessionFor(STAFF);
    for (const reason of ["First", "Second"]) {
      await changeStatus(staff, student.studentNumber, {
        status: "DEFERRED",
        reason,
      });
      await changeStatus(staff, student.studentNumber, { status: "ENROLLED" });
    }

    const page = await listActivity(staff, { page: "1" });

    expect(page.total).toBe(4);
    expect(page.items.map(({ description }) => description)).toEqual([
      "Changed the status from Deferred to Enrolled",
      "Changed the status from Enrolled to Deferred: Second",
      "Changed the status from Deferred to Enrolled",
      "Changed the status from Enrolled to Deferred: First",
    ]);
    expect(page.items[0]).toMatchObject({
      actor: { name: "Rachel Moss", role: "staff" },
      student: { studentNumber: "SMS-2026-0001", fullName: "Oliver Bennett" },
    });
    // A page past the end shows the last one, not an empty table.
    expect(await listActivity(staff, { page: "999" })).toMatchObject({
      page: 1,
      pageCount: 1,
      total: 4,
    });
    const asTheStudent = await getActivity(
      await apiRequest("GET", "/api/activity", {
        session: asStudent("SMS-2026-0001"),
      }),
      routeContext({}),
    );
    expect(asTheStudent.status).toBe(403);
  });

  it("gives each student's history, for staff only", async () => {
    const { student } = await enrolledStudent();
    await changeStatus(await sessionFor(STAFF), student.studentNumber, {
      status: "DEFERRED",
      reason: "Medical grounds",
    });
    const history = (viewer: Viewer) => async (studentNumber: string) =>
      getHistory(
        await apiRequest("GET", `/api/students/${studentNumber}/history`, {
          session: viewer,
        }),
        routeContext({ studentNumber }),
      );

    const response = await history(STAFF)("sms-2026-0001");

    expect(await bodyOf(response)).toMatchObject({
      history: [
        {
          description:
            "Changed the status from Enrolled to Deferred: Medical grounds",
          actor: { name: "Rachel Moss" },
        },
      ],
    });
    expect(
      (await history(asStudent("SMS-2026-0001"))("SMS-2026-0001")).status,
    ).toBe(403);
    expect((await history(STAFF)("SMS-2026-9999")).status).toBe(404);
  });
});
