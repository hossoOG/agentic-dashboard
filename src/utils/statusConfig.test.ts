import { describe, it, expect } from "vitest";
import {
  getStatusStyle,
  getWorktreeIcon,
  getStepIcon,
  getQAShieldIcon,
  STATUS_STYLES,
} from "./statusConfig";
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Loader2,
  Circle,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";

describe("getStatusStyle", () => {
  it("returns active style for 'active'", () => {
    expect(getStatusStyle("active")).toBe(STATUS_STYLES.active);
  });

  it("returns error style for 'error'", () => {
    expect(getStatusStyle("error")).toBe(STATUS_STYLES.error);
  });

  it("returns done style for 'done'", () => {
    expect(getStatusStyle("done")).toBe(STATUS_STYLES.done);
  });

  it("returns idle style for unknown status", () => {
    expect(getStatusStyle("nonexistent")).toBe(STATUS_STYLES.idle);
  });
});

describe("getWorktreeIcon", () => {
  it("returns AlertTriangle for blocked", () => {
    expect(getWorktreeIcon("blocked")).toBe(AlertTriangle);
  });

  it("returns AlertTriangle for error", () => {
    expect(getWorktreeIcon("error")).toBe(AlertTriangle);
  });

  it("returns CheckCircle2 for done", () => {
    expect(getWorktreeIcon("done")).toBe(CheckCircle2);
  });

  it("returns GitBranch for other statuses", () => {
    expect(getWorktreeIcon("active")).toBe(GitBranch);
  });
});

describe("getStepIcon", () => {
  it("returns CheckCircle2 with spinning=false for completed step", () => {
    const result = getStepIcon("setup", ["setup", "plan"], "code");
    expect(result.icon).toBe(CheckCircle2);
    expect(result.spinning).toBe(false);
  });

  it("returns Loader2 with spinning=true for current step", () => {
    const result = getStepIcon("code", ["setup", "plan"], "code");
    expect(result.icon).toBe(Loader2);
    expect(result.spinning).toBe(true);
  });

  it("returns Circle with spinning=false for future step", () => {
    const result = getStepIcon("review", ["setup"], "plan");
    expect(result.icon).toBe(Circle);
    expect(result.spinning).toBe(false);
  });
});

describe("getQAShieldIcon", () => {
  it("returns ShieldCheck for pass", () => {
    expect(getQAShieldIcon("pass")).toBe(ShieldCheck);
  });

  it("returns ShieldAlert for non-pass status", () => {
    expect(getQAShieldIcon("fail")).toBe(ShieldAlert);
    expect(getQAShieldIcon("pending")).toBe(ShieldAlert);
  });
});
