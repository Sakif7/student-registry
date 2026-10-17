// An academic year's calendar (staff only). PUT sets it up or changes it:
// its semester dates and "studentsChooseModules". PATCH changes only
// "studentsChooseModules", leaving the dates as they are. The year is
// written 2026-27 here.
import { academicYearFromSlug } from "@/domain/academic-year";
import { handle, json, readJson } from "@/server/http";
import {
  saveAcademicYear,
  setStudentsChoose,
} from "@/server/services/curriculum";

type Context = RouteContext<"/api/academic-years/[year]">;

export const PUT = handle<Context>(async (request, { params }, session) => {
  const { year } = await params;
  const academicYear = await saveAcademicYear(
    session,
    academicYearFromSlug(year),
    await readJson(request),
  );
  return json({ academicYear });
});

export const PATCH = handle<Context>(async (request, { params }, session) => {
  const { year } = await params;
  const academicYear = await setStudentsChoose(
    session,
    academicYearFromSlug(year),
    await readJson(request),
  );
  return json({ academicYear });
});
