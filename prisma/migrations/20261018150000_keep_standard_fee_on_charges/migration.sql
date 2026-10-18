-- Each charge keeps the programme's standard fee from when it was raised, so
-- a correction is judged against that fee, not one the programme has had
-- since.
ALTER TABLE "fee_charges" ADD COLUMN "standard_fee_pence" INTEGER;

-- Existing charges didn't record it. One without a note was raised at the
-- standard fee, so its amount is that fee; one with a note took another
-- amount, so the programme's fee now is the best guess left.
UPDATE "fee_charges" AS f
SET "standard_fee_pence" = CASE
  WHEN f."note" IS NULL THEN f."amount_pence"
  ELSE p."annual_fee_pence"
END
FROM "students" AS s
JOIN "programmes" AS p ON p."id" = s."programme_id"
WHERE s."id" = f."student_id";

ALTER TABLE "fee_charges" ALTER COLUMN "standard_fee_pence" SET NOT NULL;
ALTER TABLE "fee_charges"
  ADD CONSTRAINT "fee_charges_standard_fee_pence_check"
  CHECK ("standard_fee_pence" >= 0);
