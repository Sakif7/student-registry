-- A registration the student had work in is ended, not dropped, when they
-- leave the module during the year (e.g. on changing programme): the work
-- stays, but deadlines after it aren't theirs, and its credits don't count.
ALTER TABLE "module_registrations" ADD COLUMN "ended_at" TIMESTAMPTZ(3);

ALTER TABLE "module_registrations"
  ADD CONSTRAINT "module_registrations_ended_after_registered_check"
  CHECK ("ended_at" IS NULL OR "ended_at" >= "registered_at");
