// Sets up or changes an academic year's calendar (staff only): its semester
// dates and "studentsChooseModules". The year is written 2026-27 here.
import { academicYearFromSlug } from "@/domain/academic-year";
import { handle, json, readJson } from "@/server/http";
import { saveAcademicYear } from "@/server/services/curriculum";

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
