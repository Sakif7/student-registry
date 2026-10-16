-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "student_id" UUID,
    "details" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_student_id_occurred_at_idx" ON "audit_events"("student_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_actor_id_idx" ON "audit_events"("actor_id");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Actions are written by the app, in the form "area.what_happened".
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_action_check"
  CHECK ("action" ~ '^[a-z_]+[.][a-z_]+$');

-- The trail is append-only: updating or deleting an event fails, so neither
-- a bug nor a mistaken script can rewrite history. TRUNCATE, which the seed
-- and the tests use to start afresh, is a different statement and still
-- works.
CREATE FUNCTION "audit_events_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'The audit trail is append-only: % is not allowed', TG_OP;
END;
$$;

CREATE TRIGGER "audit_events_append_only"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_append_only"();
