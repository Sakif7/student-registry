-- A reversed payment no longer counts, so its bank reference can be
-- recorded again (typically for the right student). Uniqueness among the
-- payments that count is checked by the service, under an advisory lock on
-- the reference; this index keeps that check fast.
DROP INDEX "payments_reference_key";

CREATE INDEX "payments_reference_idx" ON "payments"("reference");
