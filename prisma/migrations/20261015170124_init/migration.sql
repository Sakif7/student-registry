-- CreateEnum
CREATE TYPE "enrolment_status" AS ENUM ('ENROLLED', 'DEFERRED', 'WITHDRAWN', 'COMPLETED');

-- CreateTable
CREATE TABLE "programmes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "annual_fee_pence" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programmes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "programme_id" UUID NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "student_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "programme_id" UUID NOT NULL,
    "academic_year" TEXT NOT NULL,
    "status" "enrolment_status" NOT NULL DEFAULT 'ENROLLED',
    "results_withheld_at" TIMESTAMPTZ(3),
    "results_withheld_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_number_counters" (
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL,

    CONSTRAINT "student_number_counters_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "enrolment_status_changes" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "from_status" "enrolment_status",
    "to_status" "enrolment_status" NOT NULL,
    "reason" TEXT,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrolment_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_charges" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount_pence" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fee_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "amount_pence" INTEGER NOT NULL,
    "paid_on" DATE NOT NULL,
    "reference" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reversals" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "reversed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "deadline" TIMESTAMPTZ(3) NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_results" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "mark" INTEGER NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "programmes_code_key" ON "programmes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "modules_code_key" ON "modules"("code");

-- CreateIndex
CREATE INDEX "modules_programme_id_idx" ON "modules"("programme_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_student_number_key" ON "students"("student_number");

-- CreateIndex
CREATE UNIQUE INDEX "students_email_key" ON "students"("email");

-- CreateIndex
CREATE INDEX "students_programme_id_idx" ON "students"("programme_id");

-- CreateIndex
CREATE INDEX "students_status_idx" ON "students"("status");

-- CreateIndex
CREATE INDEX "students_academic_year_idx" ON "students"("academic_year");

-- CreateIndex
CREATE INDEX "enrolment_status_changes_student_id_changed_at_idx" ON "enrolment_status_changes"("student_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "fee_charges_student_id_academic_year_key" ON "fee_charges"("student_id", "academic_year");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "payments_student_id_idx" ON "payments"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reversals_payment_id_key" ON "payment_reversals"("payment_id");

-- CreateIndex
CREATE INDEX "assessments_module_id_idx" ON "assessments"("module_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_storage_key_key" ON "submissions"("storage_key");

-- CreateIndex
CREATE INDEX "submissions_assessment_id_idx" ON "submissions"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_student_id_assessment_id_key" ON "submissions"("student_id", "assessment_id");

-- CreateIndex
CREATE INDEX "assessment_results_assessment_id_idx" ON "assessment_results"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_results_student_id_assessment_id_key" ON "assessment_results"("student_id", "assessment_id");

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment_status_changes" ADD CONSTRAINT "enrolment_status_changes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints: rules the Prisma schema language cannot express. The app
-- validates input first; these are the last line of defence for anything that
-- reaches the database another way.

-- Money is never negative; a payment is always a positive amount.
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_annual_fee_pence_check" CHECK ("annual_fee_pence" >= 0);
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_amount_pence_check" CHECK ("amount_pence" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_pence_check" CHECK ("amount_pence" > 0);

-- Identifiers and academic years keep one format.
ALTER TABLE "students" ADD CONSTRAINT "students_student_number_check" CHECK ("student_number" ~ '^SMS-[0-9]{4}-[0-9]{4,}$');
ALTER TABLE "students" ADD CONSTRAINT "students_academic_year_check" CHECK ("academic_year" ~ '^[0-9]{4}/[0-9]{2}$');
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_academic_year_check" CHECK ("academic_year" ~ '^[0-9]{4}/[0-9]{2}$');
ALTER TABLE "student_number_counters" ADD CONSTRAINT "student_number_counters_last_value_check" CHECK ("last_value" >= 1);

-- Normalised values, so uniqueness cannot be dodged by case or spacing.
ALTER TABLE "students" ADD CONSTRAINT "students_email_check" CHECK ("email" = lower("email"));
ALTER TABLE "payments" ADD CONSTRAINT "payments_reference_check" CHECK ("reference" = upper(btrim("reference")) AND "reference" <> '');

-- A results hold always has both its date and its reason.
ALTER TABLE "students" ADD CONSTRAINT "students_results_hold_check" CHECK (("results_withheld_at" IS NULL) = ("results_withheld_reason" IS NULL));

-- A status change always changes the status.
ALTER TABLE "enrolment_status_changes" ADD CONSTRAINT "enrolment_status_changes_status_check" CHECK ("from_status" IS DISTINCT FROM "to_status");

-- Uploads are never empty, and attempts count from 1.
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_size_bytes_check" CHECK ("size_bytes" > 0);
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_attempt_check" CHECK ("attempt" >= 1);

-- Marks are percentages.
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_mark_check" CHECK ("mark" BETWEEN 0 AND 100);
