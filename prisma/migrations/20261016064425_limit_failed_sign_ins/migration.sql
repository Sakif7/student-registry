-- CreateTable
CREATE TABLE "sign_in_failures" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sign_in_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sign_in_failures_email_created_at_idx" ON "sign_in_failures"("email", "created_at");

-- Addresses are recorded as Better Auth compares them, in lower case, so
-- failures in different case count against the same address.
ALTER TABLE "sign_in_failures" ADD CONSTRAINT "sign_in_failures_email_lower_case_check"
  CHECK ("email" = lower("email"));
