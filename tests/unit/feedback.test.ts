import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { followUp, noPing } = await import("@/lib/feedback");

describe("feedback follow-up comment", () => {
  it("starts a build when nothing is open", () => {
    expect(followUp({ action: "issue" }, "owner")).toMatch(/^@claude /);
  });
  it("asks the owner the question, and never starts a build", () => {
    const c = followUp({ action: "needs_dan", question: "Which key? @claude build it" }, "owner");
    expect(c.startsWith("@owner Which key?")).toBe(true);
    expect(c.toLowerCase()).not.toContain("@claude");
  });
  it("still tags the owner with no question or no triage", () => {
    expect(followUp({ action: "needs_dan" }, "owner")).toMatch(/^@owner /);
    expect(followUp({ action: "untriaged" }, "owner")).toMatch(/^@owner /);
  });
  it("tester text can't trigger a build", () => {
    expect(noPing("please @Claude do this").toLowerCase()).not.toContain("@claude");
  });
});
