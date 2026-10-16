import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Form } from "./form";

describe("Form", () => {
  it("is marked unavailable in the server's HTML, until React hydrates it", () => {
    const html = renderToStaticMarkup(
      createElement(Form, { className: "grid" }, "Fields"),
    );

    expect(html).toBe('<form aria-disabled="true" class="grid">Fields</form>');
  });
});
