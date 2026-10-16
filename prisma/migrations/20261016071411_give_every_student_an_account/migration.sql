-- Enrolment now creates each student's sign-in account. Students enrolled
-- before sign-in existed get one here, waiting for activation, so every
-- student has an account. A student whose email address already belongs to
-- another account (such as a member of staff) is skipped: staff can sort out
-- the address, and sending an activation email then creates the account.
INSERT INTO "users" (
  "id", "name", "email", "email_verified", "role", "student_number",
  "created_at", "updated_at"
)
SELECT uuidv7(), s."full_name", lower(s."email"), false, 'student',
  s."student_number", s."created_at", now()
FROM "students" s
WHERE NOT EXISTS (
  SELECT 1 FROM "users" u WHERE u."student_number" = s."student_number"
)
ON CONFLICT ("email") DO NOTHING;
