import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const parsed = Number.parseInt(hex.slice(1), 16);
  const red = channel((parsed >> 16) & 255);
  const green = channel((parsed >> 8) & 255);
  const blue = channel(parsed & 255);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

it("epitaph bone text on the void shade passes WCAG AA", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const bone = css.match(/--color-bone:\s*(#[0-9a-fA-F]{6})/)?.[1];
  const voidColor = css.match(/--color-bg-void:\s*(#[0-9a-fA-F]{6})/)?.[1];
  expect(bone).toBeTruthy();
  expect(voidColor).toBeTruthy();
  expect(contrast(bone ?? "#000000", voidColor ?? "#ffffff")).toBeGreaterThanOrEqual(4.5);

  const tombstone = readFileSync("src/components/pet/Tombstone.tsx", "utf8");
  expect(tombstone).toContain("text-bone");
  expect(tombstone).toContain("PixelButton");
  const button = readFileSync("src/components/ui/PixelButton.tsx", "utf8");
  expect(button).toContain("outline-[var(--color-pumpkin)]");
  expect(button).not.toMatch(/outline-none/);
});

it("sprites name the pet, the tombstone, and the zombie", () => {
  const sprite = readFileSync("src/components/pet/PetSprite.tsx", "utf8");
  expect(sprite).toContain("Ghost pet egg");
  expect(sprite).toContain("Ghost pet — hatchling stage");
  expect(sprite).toContain("stage, hungry");
  expect(readFileSync("src/components/pet/EggHatch.tsx", "utf8")).toContain(
    'alt="Ghost pet egg hatching"',
  );
  expect(readFileSync("src/components/pet/Tombstone.tsx", "utf8")).toContain(
    'alt="Tombstone for a ghost pet"',
  );
  expect(readFileSync("src/components/zombies/ZombieSprite.tsx", "utf8")).toContain(
    'alt="Zombie haunting an overdue task"',
  );
});

it("task controls expose a name, a text status, and labels", () => {
  const item = readFileSync("src/components/tasks/TaskItem.tsx", "utf8");
  expect(item).toContain("aria-label={`Complete ${task.title}`}");
  expect(item).toContain("{task.status}");
  const form = readFileSync("src/components/tasks/TaskForm.tsx", "utf8");
  for (const id of ["task-title", "task-category", "task-size", "task-due", "task-late"]) {
    expect(form).toContain(`htmlFor="${id}"`);
    expect(form).toContain(`id="${id}"`);
  }
});
