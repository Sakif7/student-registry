"use client";

// Lets the viewer use the registry as Registry staff or as one student.
// Switching reloads the page fully, so nothing from the previous view
// (form state, cached pages) carries over into the new one.
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { ENROLMENT_STATUS_LABELS } from "@/domain/enrolment";
import { ApiError, apiRequest } from "@/lib/api-client";
import type { ViewerOption } from "@/server/services/viewers";

type Choice = { role: "staff" } | { role: "student"; studentNumber: string };

export function ViewPicker({
  students,
  currentStudent,
}: {
  students: ViewerOption[];
  currentStudent?: string;
}) {
  const [studentNumber, setStudentNumber] = useState(
    currentStudent ?? students[0]?.studentNumber ?? "",
  );
  const [pending, setPending] = useState<Choice["role"] | null>(null);

  async function choose(choice: Choice, destination: string) {
    setPending(choice.role);
    try {
      await apiRequest("POST", "/api/session", choice);
      window.location.assign(destination);
    } catch (error) {
      setPending(null);
      toast.error(
        error instanceof ApiError ? error.message : "Something went wrong.",
      );
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Registry staff</h2>
          </CardTitle>
          <CardDescription>
            Enrol students, record fees and payments, set assessments, and enter
            and release results.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button
            disabled={pending !== null}
            onClick={() => void choose({ role: "staff" }, "/staff")}
          >
            {pending === "staff" ? "Opening…" : "Continue as staff"}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Student</h2>
          </CardTitle>
          <CardDescription>
            See a student&apos;s record and fees, submit work, and view
            published results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <p className="text-muted-foreground">
              There are no students yet. Continue as staff to enrol one.
            </p>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="student">Student</Label>
              <NativeSelect
                id="student"
                className="w-full"
                value={studentNumber}
                onChange={(event) => setStudentNumber(event.target.value)}
              >
                {students.map((student) => (
                  <NativeSelectOption
                    key={student.studentNumber}
                    value={student.studentNumber}
                  >
                    {student.fullName} · {student.studentNumber} ·{" "}
                    {ENROLMENT_STATUS_LABELS[student.status]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button
            disabled={pending !== null || studentNumber === ""}
            onClick={() =>
              void choose({ role: "student", studentNumber }, "/student")
            }
          >
            {pending === "student" ? "Opening…" : "Continue as student"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
