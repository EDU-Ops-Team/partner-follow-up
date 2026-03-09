import { describe, it, expect } from "vitest";
import {
  normalizeAddress,
  matchAddress,
  similarity,
} from "../../convex/lib/addressNormalizer";

describe("normalizeAddress", () => {
  it("lowercases and trims", () => {
    expect(normalizeAddress("  123 MAIN ST  ")).toBe("123 main st");
  });

  it("removes punctuation", () => {
    expect(normalizeAddress("123 Main St., Apt. #4")).toBe("123 main st apt 4");
  });

  it("replaces long forms with abbreviations", () => {
    expect(normalizeAddress("123 Main Street")).toBe("123 main st");
    expect(normalizeAddress("456 Oak Avenue")).toBe("456 oak ave");
    expect(normalizeAddress("789 Pine Boulevard")).toBe("789 pine blvd");
  });

  it("normalizes directionals", () => {
    expect(normalizeAddress("100 North Main Street")).toBe("100 n main st");
    expect(normalizeAddress("200 Southeast Oak Drive")).toBe("200 se oak dr");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeAddress("123  Main   Street")).toBe("123 main st");
  });

  it("handles already abbreviated addresses", () => {
    expect(normalizeAddress("123 Main St")).toBe("123 main st");
  });
});

describe("similarity", () => {
  it("returns 1 for identical strings", () => {
    expect(similarity("hello", "hello")).toBe(1);
  });

  it("returns 0 for completely different strings of same length", () => {
    expect(similarity("abcde", "fghij")).toBe(0);
  });

  it("returns partial match for similar strings", () => {
    const sim = similarity("123 main st", "123 main ave");
    expect(sim).toBeGreaterThan(0.7);
    expect(sim).toBeLessThan(1);
  });
});

describe("matchAddress", () => {
  const candidates = [
    "123 Main Street, Springfield, IL 62701",
    "456 Oak Avenue, Chicago, IL 60601",
    "789 Pine Boulevard, Naperville, IL 60540",
  ];

  it("finds exact match after normalization", () => {
    const result = matchAddress("123 Main St, Springfield, IL 62701", candidates);
    expect(result.matched).toBe(true);
    expect(result.confidence).toBe(1.0);
  });

  it("finds fuzzy match for minor differences", () => {
    const result = matchAddress("456 Oak Ave Chicago IL 60601", candidates);
    expect(result.matched).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("rejects low-confidence matches", () => {
    const result = matchAddress("999 Completely Different Address", candidates);
    expect(result.matched).toBe(false);
    expect(result.confidence).toBeLessThan(0.85);
  });

  it("handles empty candidates list", () => {
    const result = matchAddress("123 Main St", []);
    expect(result.matched).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("respects custom threshold", () => {
    const result = matchAddress("123 Main Street Springfield", candidates, 0.95);
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});
