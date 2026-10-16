import { describe, expect, it } from "vitest";

import { activationEmail, passwordResetEmail } from "./emails";

const LINK = {
  to: "amelia.hart@student.example",
  name: "Amelia Hart",
  url: "http://localhost:3000/api/auth/reset-password/abc123?callbackURL=%2Factivate",
  validHours: 72,
};

describe("activationEmail", () => {
  it("invites the student to set a password, with the link and how long it works", () => {
    const email = activationEmail(LINK);

    expect(email.to).toBe("amelia.hart@student.example");
    expect(email.subject).toBe("Activate your Student Registry account");
    expect(email.text).toContain("Hello Amelia Hart,");
    expect(email.text).toContain(`Set your password: ${LINK.url}`);
    expect(email.text).toContain("for 72 hours");
    expect(email.html).toContain(`href="${LINK.url.replace("&", "&amp;")}"`);
  });
});

describe("passwordResetEmail", () => {
  it("offers a new password, and says what to do if it wasn't them", () => {
    const email = passwordResetEmail(LINK);

    expect(email.subject).toBe("Reset your Student Registry password");
    expect(email.text).toContain(`Choose a new password: ${LINK.url}`);
    expect(email.text).toContain("If it wasn't you, ignore this email");
    expect(email.text).toContain("signs you out everywhere else");
  });

  it("escapes names and links in the HTML", () => {
    const email = passwordResetEmail({
      ...LINK,
      name: `Liam O'Connor <b>`,
      url: `${LINK.url}&x="y"`,
    });

    expect(email.html).toContain("Hello Liam O&#39;Connor &lt;b&gt;,");
    expect(email.html).toContain("&amp;x=&quot;y&quot;");
    expect(email.html).not.toContain("<b>");
    // Plain text needs no escaping.
    expect(email.text).toContain("Hello Liam O'Connor <b>,");
  });
});
