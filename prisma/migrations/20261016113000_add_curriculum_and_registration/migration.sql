-- Curriculum and module registration. A module stops belonging to a single
-- programme: programmes list their modules by year of study, as core or
-- optional, and students are registered on modules for each academic year.
-- Academic years gain semester dates and a switch that lets students choose
-- their own optional modules.
--
-- Existing data keeps its meaning: every module becomes a core module in the
-- first year of the programme it belonged to, and every student is
-- registered on their programme's modules for their academic year, so the
-- same students take the same assessments as before.

-- CreateEnum
CREATE TYPE "semester" AS ENUM ('FIRST', 'SECOND', 'ALL_YEAR');

-- CreateEnum
CREATE TYPE "module_kind" AS ENUM ('CORE', 'OPTIONAL');

-- Existing programmes become three-year programmes of 120 credits a year, and
-- existing modules 30-credit modules taught all year, until staff say
-- otherwise. The defaults only fill existing rows.
ALTER TABLE "programmes"
  ADD COLUMN "years" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "credits_per_year" INTEGER NOT NULL DEFAULT 120;
ALTER TABLE "programmes"
  ALTER COLUMN "years" DROP DEFAULT,
  ALTER COLUMN "credits_per_year" DROP DEFAULT;

ALTER TABLE "modules"
  ADD COLUMN "credits" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "semester" "semester" NOT NULL DEFAULT 'ALL_YEAR';
ALTER TABLE "modules"
  ALTER COLUMN "credits" DROP DEFAULT,
  ALTER COLUMN "semester" DROP DEFAULT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN "year_of_study" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "programme_modules" (
    "programme_id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "year_of_study" INTEGER NOT NULL,
    "kind" "module_kind" NOT NULL,

    CONSTRAINT "programme_modules_pkey" PRIMARY KEY ("programme_id","module_id")
);

INSERT INTO "programme_modules" ("programme_id", "module_id", "year_of_study", "kind")
SELECT "programme_id", "id", 1, 'CORE' FROM "modules";

-- CreateTable
CREATE TABLE "module_registrations" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "academic_year" TEXT NOT NULL,
    "registered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_registrations_pkey" PRIMARY KEY ("id")
);

INSERT INTO "module_registrations" ("id", "student_id", "module_id", "academic_year")
SELECT uuidv7(), s."id", pm."module_id", s."academic_year"
FROM "students" s
JOIN "programme_modules" pm ON pm."programme_id" = s."programme_id";

-- Only now can modules lose their programme.
ALTER TABLE "modules" DROP CONSTRAINT "modules_programme_id_fkey";
DROP INDEX "modules_programme_id_idx";
ALTER TABLE "modules" DROP COLUMN "programme_id";

-- CreateTable
CREATE TABLE "academic_years" (
    "year" TEXT NOT NULL,
    "semester_1_start" DATE NOT NULL,
    "semester_1_end" DATE NOT NULL,
    "semester_2_start" DATE NOT NULL,
    "semester_2_end" DATE NOT NULL,
    "students_choose_modules" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE INDEX "programme_modules_module_id_idx" ON "programme_modules"("module_id");

-- CreateIndex
CREATE INDEX "module_registrations_module_id_academic_year_idx" ON "module_registrations"("module_id", "academic_year");

-- CreateIndex
CREATE UNIQUE INDEX "module_registrations_student_id_module_id_academic_year_key" ON "module_registrations"("student_id", "module_id", "academic_year");

-- AddForeignKey
ALTER TABLE "programme_modules" ADD CONSTRAINT "programme_modules_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programme_modules" ADD CONSTRAINT "programme_modules_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_registrations" ADD CONSTRAINT "module_registrations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_registrations" ADD CONSTRAINT "module_registrations_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints the Prisma schema language cannot express. A student's
-- or a module's year of study can't exceed its programme's length, but a
-- CHECK can't look at another table: the services enforce that.
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_years_check" CHECK ("years" BETWEEN 1 AND 7);
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_credits_per_year_check" CHECK ("credits_per_year" > 0);
ALTER TABLE "modules" ADD CONSTRAINT "modules_credits_check" CHECK ("credits" > 0);
ALTER TABLE "programme_modules" ADD CONSTRAINT "programme_modules_year_of_study_check" CHECK ("year_of_study" >= 1);
ALTER TABLE "students" ADD CONSTRAINT "students_year_of_study_check" CHECK ("year_of_study" >= 1);
ALTER TABLE "module_registrations" ADD CONSTRAINT "module_registrations_academic_year_check" CHECK ("academic_year" ~ '^[0-9]{4}/[0-9]{2}$');
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_year_check" CHECK ("year" ~ '^[0-9]{4}/[0-9]{2}$');

-- The semesters follow each other, without overlapping, inside the academic
-- year, which runs from 1 September to 31 August.
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_semesters_check" CHECK (
  "semester_1_start" >= make_date(left("year", 4)::int, 9, 1)
  AND "semester_1_start" < "semester_1_end"
  AND "semester_1_end" < "semester_2_start"
  AND "semester_2_start" < "semester_2_end"
  AND "semester_2_end" <= make_date(left("year", 4)::int + 1, 8, 31)
);
