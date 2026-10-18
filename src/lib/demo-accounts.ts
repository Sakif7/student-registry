// The demo logins: created by the seed and listed on the sign-in page when
// SHOW_DEMO_ACCOUNTS is on. Every person here is fictitious, and the shared
// password exists only in demo data.

/** The password of every seeded account that can sign in. */
export const DEMO_PASSWORD = "demo-password-2026";

/**
 * Mailpit's web inbox from compose.yaml, where every email the app sends
 * locally arrives. Demo pages point to it.
 */
export const DEMO_INBOX_URL = "http://localhost:8025";

/** A demo login, with what makes it worth trying. */
export interface DemoAccount {
  name: string;
  email: string;
  role: "staff" | "student";
  note: string;
}

/** Registry staff. There is no administrator: all staff are equals. */
export const DEMO_STAFF = [
  {
    name: "Jane Okafor",
    email: "jane.okafor@college.example",
    role: "staff",
    note: "Registry officer",
  },
  {
    name: "Tom Reid",
    email: "tom.reid@college.example",
    role: "staff",
    note: "Registry officer",
  },
  {
    name: "Elena Petrova",
    email: "elena.petrova@college.example",
    role: "staff",
    note: "Registry officer",
  },
] as const satisfies readonly DemoAccount[];

/**
 * Students the sign-in page suggests, each showing something different. Most
 * other seeded students can sign in with the demo password too (see the cast
 * in prisma/seed.ts).
 */
export const DEMO_STUDENTS = [
  {
    name: "Amelia Hart",
    email: "amelia.hart@student.example",
    role: "student",
    note: "Fees overdue, results withheld",
  },
  {
    name: "Sofia Rossi",
    email: "sofia.rossi@student.example",
    role: "student",
    note: "Deferred",
  },
  {
    name: "Mohammed Al-Farsi",
    email: "mohammed.al-farsi@student.example",
    role: "student",
    note: "Completed, with published results",
  },
  {
    name: "Tomasz Nowak",
    email: "tomasz.nowak@student.example",
    role: "student",
    note: "Not yet moved on from last year",
  },
] as const satisfies readonly DemoAccount[];

/** The logins the sign-in page offers: two staff, then the students. */
export const DEMO_LOGINS: readonly DemoAccount[] = [
  ...DEMO_STAFF.slice(0, 2),
  ...DEMO_STUDENTS,
];
