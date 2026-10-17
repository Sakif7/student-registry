// Addresses under /api that no route matches answer as the API's other
// errors do: problem details, never Next.js's HTML page.
import { describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/[...path]/route";

import { apiRequest, bodyOf, STAFF } from "../helpers/requests";

const context = { params: Promise.resolve({ path: ["no-such-thing"] }) };

describe("an unknown API address", () => {
  it("answers 404 with problem details, signed in or not", async () => {
    for (const response of [
      await GET(
        await apiRequest("GET", "/api/no-such-thing", { session: STAFF }),
        context,
      ),
      await POST(
        await apiRequest("POST", "/api/no-such-thing", { json: {} }),
        context,
      ),
    ]) {
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toBe(
        "application/problem+json",
      );
      expect(await bodyOf(response)).toMatchObject({
        status: 404,
        detail: "There is no such address in this API.",
      });
    }
  });
});
