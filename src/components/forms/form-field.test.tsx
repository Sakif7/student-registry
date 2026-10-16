import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FormField } from "./form-field";

function EmailField() {
  return (
    <FormField
      id="email"
      label="Email"
      description="The address the Registry has for you."
      error="Enter your email address"
    >
      {(control) => <input {...control} />}
    </FormField>
  );
}

describe("FormField", () => {
  it("gives each instance its own ids, so a label never points at another form's control", () => {
    const html = renderToStaticMarkup(
      <>
        <EmailField />
        <EmailField />
      </>,
    );

    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(([, id]) => id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    const labelled = [...html.matchAll(/ for="([^"]+)"/g)].map(([, id]) => id);
    const inputs = [...html.matchAll(/<input id="([^"]+)"/g)].map(
      ([, id]) => id,
    );
    expect(labelled).toEqual(inputs);
  });

  it("describes the control with its hint and error", () => {
    const html = renderToStaticMarkup(<EmailField />);

    const [, describedBy = ""] = / aria-describedby="([^"]+)"/.exec(html) ?? [];
    const [descriptionId, errorId] = describedBy.split(" ");
    expect(html).toContain(`id="${descriptionId}"`);
    expect(html).toContain(`id="${errorId}"`);
    expect(html).toContain('aria-invalid="true"');
  });
});
