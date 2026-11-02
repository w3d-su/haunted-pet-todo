import { expect, it } from "vitest";
import { buildEpitaphPrompt, normalizeEpitaph, resolveEpitaph } from "@/lib/ai/epitaph";
import { FALLBACK_EPITAPH, initialPetState } from "@/lib/game/pet";
import type { Task } from "@/lib/game/tasks";

const NOW = Date.UTC(2026, 6, 4, 8);

function task(title: string, notes: string | null = null): Task {
  return {
    id: crypto.randomUUID(),
    userId: "11111111-1111-4111-8111-111111111111",
    title,
    notes,
    category: "chores",
    size: "small",
    status: "overdue",
    dueAt: NOW,
    completedAt: null,
    deletedAt: null,
    parentId: null,
    breakdownSuggested: false,
    allSubtasksDone: false,
    sortOrder: 1,
    createdAt: NOW,
  };
}

it("quotes task names and keeps a quote from breaking the prompt", () => {
  const pet = initialPetState("11111111-1111-4111-8111-111111111111", NOW, crypto.randomUUID(), "UTC");
  const prompt = buildEpitaphPrompt(pet, [task('Reply to "emails"\nnow')]);
  expect(prompt).toContain("Reply to");
  expect(prompt).toContain("emails");
  expect(prompt).not.toContain("\nnow");
  expect(prompt).toContain("egg");
  expect(prompt).not.toContain('"emails"');
});

it("accepts two to four short lines and rejects the rest", () => {
  expect(normalizeEpitaph("Here lies Spooky,\nslain by dishes")).toBe(
    "Here lies Spooky,\nslain by dishes",
  );
  expect(normalizeEpitaph("only one line")).toBeNull();
  expect(normalizeEpitaph("a\nb\nc\nd\ne")).toBeNull();
  expect(normalizeEpitaph(`${"x".repeat(41)}\nstill here`)).toBeNull();
});

it("uses the fixed epitaph when the model is missing or invalid", async () => {
  const pet = {
    ...initialPetState("11111111-1111-4111-8111-111111111111", NOW, crypto.randomUUID(), "UTC"),
    status: "dead" as const,
  };
  const missing = await resolveEpitaph(pet, [task("Fold the laundry")], async () => null);
  expect(missing).toEqual({ epitaph: FALLBACK_EPITAPH, source: "fallback" });
  const invalid = await resolveEpitaph(pet, [], async () => ({ epitaph: "too short" }));
  expect(invalid.source).toBe("fallback");
  const carved = await resolveEpitaph(pet, [], async () => ({
    epitaph: "Here lies Spooky,\nslain by dishes",
  }));
  expect(carved).toEqual({
    epitaph: "Here lies Spooky,\nslain by dishes",
    source: "llm",
  });
  const stripped = await resolveEpitaph(pet, [], async () => ({
    epitaph: "Here lies Spooky,\nslain by <b>dishes</b> https://evil.example",
  }));
  expect(stripped.epitaph).toBe("Here lies Spooky,\nslain by dishes");
  const links = await resolveEpitaph(pet, [], async () => ({
    epitaph: "Here lies Spooky,\nsee www.evil.test and javascript:alert(1)",
  }));
  expect(links.epitaph).toBe("Here lies Spooky,\nsee and alert(1)");
  expect(links.epitaph).not.toMatch(/www\.|javascript:/);
});
