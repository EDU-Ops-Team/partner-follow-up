import { describe, expect, it } from "vitest";
import {
  analyzeReviewDiff,
  htmlToPlainText,
  plainTextToHtml,
} from "../../convex/lib/reviewDiff";

describe("reviewDiff helpers", () => {
  it("converts html to plain text", () => {
    expect(htmlToPlainText("<p>Hello<br>World</p><p>Thanks</p>")).toBe("Hello\nWorld\n\nThanks");
  });

  it("converts plain text to html", () => {
    expect(plainTextToHtml("Hello\nWorld")).toBe("Hello<br>World");
  });
});

describe("analyzeReviewDiff", () => {
  const baseInput = {
    originalTo: "partner@example.com",
    originalCc: "ops@example.com",
    originalSubject: "Re: Site update",
    originalBodyHtml: "<p>Hello team,<br>We have the site scheduled.</p>",
    editedTo: "partner@example.com",
    editedCc: "ops@example.com",
    editedSubject: "Re: Site update",
    editedBodyText: "Hello team,\nWe have the site scheduled.",
  };

  it("treats identical content as approved as-is", () => {
    const diff = analyzeReviewDiff(baseInput);
    expect(diff.editsMade).toBe(false);
    expect(diff.editDistance).toBe(0);
    expect(diff.editCategories).toEqual([]);
  });

  it("tracks cc-only changes without inflating content distance", () => {
    const diff = analyzeReviewDiff({
      ...baseInput,
      editedCc: "ops@example.com, reviewer@example.com",
    });
    expect(diff.editsMade).toBe(true);
    expect(diff.editDistance).toBe(0);
    expect(diff.editCategories).toEqual(["recipient_cc_changed"]);
  });

  it("classifies a small body tweak as a minor edit", () => {
    const diff = analyzeReviewDiff({
      ...baseInput,
      editedBodyText: "Hello team,\nWe have the site scheduled!",
    });
    expect(diff.editsMade).toBe(true);
    expect(diff.editCategories).toContain("body_minor_edit");
    expect(diff.editDistance).toBeGreaterThan(0);
  });

  it("classifies a larger rewrite separately", () => {
    const diff = analyzeReviewDiff({
      ...baseInput,
      editedSubject: "Re: Need more details",
      editedBodyText: "Thank you for the update. We need access details before we can confirm the visit.",
    });
    expect(diff.editsMade).toBe(true);
    expect(diff.editCategories).toContain("subject_changed");
    expect(diff.editCategories).toContain("body_rewrite");
  });
});
