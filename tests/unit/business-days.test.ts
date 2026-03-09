import { describe, it, expect } from "vitest";
import {
  isBusinessDay,
  addBusinessDays,
  countBusinessDays,
  nextBusinessDay,
  isHolidayStatic,
} from "../../convex/lib/businessDays";

describe("isBusinessDay", () => {
  it("returns true for a regular weekday", () => {
    expect(isBusinessDay(new Date(2026, 2, 4))).toBe(true);
  });

  it("returns false for Saturday", () => {
    expect(isBusinessDay(new Date(2026, 2, 7))).toBe(false);
  });

  it("returns false for Sunday", () => {
    expect(isBusinessDay(new Date(2026, 2, 8))).toBe(false);
  });

  it("returns false for a holiday (Christmas 2026)", () => {
    expect(isBusinessDay(new Date(2026, 11, 25))).toBe(false);
  });

  it("returns false for observed holidays", () => {
    expect(isBusinessDay(new Date(2026, 6, 3))).toBe(false);
  });
});

describe("isHolidayStatic", () => {
  it("detects New Year's Day 2026", () => {
    expect(isHolidayStatic(new Date(2026, 0, 1))).toBe(true);
  });

  it("returns false for a regular day", () => {
    expect(isHolidayStatic(new Date(2026, 2, 4))).toBe(false);
  });
});

describe("addBusinessDays", () => {
  it("adds 1 business day on a weekday", () => {
    const result = addBusinessDays(new Date(2026, 2, 4), 1);
    expect(result.getDate()).toBe(5);
    expect(result.getMonth()).toBe(2);
  });

  it("skips weekends", () => {
    const result = addBusinessDays(new Date(2026, 2, 6), 1);
    expect(result.getDate()).toBe(9);
  });

  it("adds 2 business days over a weekend", () => {
    const result = addBusinessDays(new Date(2026, 2, 5), 2);
    expect(result.getDate()).toBe(9);
  });

  it("skips holidays", () => {
    const result = addBusinessDays(new Date(2026, 11, 24), 1);
    expect(result.getDate()).toBe(28);
  });

  it("handles 0 business days", () => {
    const result = addBusinessDays(new Date(2026, 2, 4), 0);
    expect(result.getDate()).toBe(4);
  });
});

describe("countBusinessDays", () => {
  it("counts business days between two weekdays", () => {
    const count = countBusinessDays(new Date(2026, 2, 4), new Date(2026, 2, 6));
    expect(count).toBe(2);
  });

  it("counts across weekends", () => {
    const count = countBusinessDays(new Date(2026, 2, 4), new Date(2026, 2, 11));
    expect(count).toBe(5);
  });

  it("returns 0 for same day", () => {
    const count = countBusinessDays(new Date(2026, 2, 4), new Date(2026, 2, 4));
    expect(count).toBe(0);
  });
});

describe("nextBusinessDay", () => {
  it("returns same day if already a business day", () => {
    const result = nextBusinessDay(new Date(2026, 2, 4));
    expect(result.getDate()).toBe(4);
  });

  it("skips to Monday from Saturday", () => {
    const result = nextBusinessDay(new Date(2026, 2, 7));
    expect(result.getDate()).toBe(9);
    expect(result.getDay()).toBe(1);
  });

  it("skips to Monday from Sunday", () => {
    const result = nextBusinessDay(new Date(2026, 2, 8));
    expect(result.getDate()).toBe(9);
  });
});
