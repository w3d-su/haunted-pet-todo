"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import { TASK_CATEGORIES, TASK_SIZES } from "@/lib/game/tasks";
import { PixelButton } from "@/components/ui/PixelButton";

const FormSchema = z.object({
  title: z.string().trim().min(1, "A task needs a name"),
  category: z.enum(TASK_CATEGORIES),
  size: z.enum(TASK_SIZES),
  dueAt: z.number().int().nullable(),
});

const field =
  "w-full border-2 border-ghost-white bg-bg-void px-2 py-2 text-[10px] leading-relaxed text-ghost-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-pumpkin)]";

export interface TaskDraft {
  title: string;
  category: (typeof TASK_CATEGORIES)[number];
  size: (typeof TASK_SIZES)[number];
  dueAt: number | null;
}

const HOUR_MS = 3_600_000;

export function TaskForm({
  pending,
  now,
  onCreate,
}: {
  pending: boolean;
  now: number;
  onCreate: (draft: TaskDraft) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<(typeof TASK_CATEGORIES)[number]>("chores");
  const [size, setSize] = useState<(typeof TASK_SIZES)[number]>("small");
  const [due, setDue] = useState("");
  const [late, setLate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const dueAt = late ? now - HOUR_MS : due ? new Date(due).getTime() : null;
    const parsed = FormSchema.safeParse({ title, category, size, dueAt });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "That task does not look right");
      return;
    }
    if (due && Number.isNaN(parsed.data.dueAt)) {
      setError("That due time is not a real moment");
      return;
    }
    setError(null);
    await onCreate(parsed.data);
    setTitle("");
    setDue("");
    setLate(false);
  }

  return (
    <form className="mt-6 flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
      <label className="text-[8px] leading-relaxed text-ghost-dim" htmlFor="task-title">
        Task
      </label>
      <input
        id="task-title"
        className={field}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={120}
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[8px] leading-relaxed text-ghost-dim" htmlFor="task-category">
            Category
          </label>
          <select
            id="task-category"
            className={field}
            value={category}
            onChange={(event) => setCategory(event.target.value as (typeof TASK_CATEGORIES)[number])}
          >
            {TASK_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[8px] leading-relaxed text-ghost-dim" htmlFor="task-size">
            Size
          </label>
          <select
            id="task-size"
            className={field}
            value={size}
            onChange={(event) => setSize(event.target.value as (typeof TASK_SIZES)[number])}
          >
            {TASK_SIZES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="text-[8px] leading-relaxed text-ghost-dim" htmlFor="task-due">
        Due, optional
      </label>
      <input
        id="task-due"
        className={field}
        type="datetime-local"
        value={due}
        onChange={(event) => setDue(event.target.value)}
      />
      <label className="flex items-center gap-2 text-[8px] leading-relaxed text-ghost-white" htmlFor="task-late">
        <input
          id="task-late"
          type="checkbox"
          checked={late}
          className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-pumpkin)]"
          onChange={(event) => setLate(event.target.checked)}
        />
        Already late
      </label>
      {error ? <p className="text-[8px] leading-relaxed text-blood">{error}</p> : null}
      <PixelButton type="submit" disabled={pending}>
        Add task
      </PixelButton>
    </form>
  );
}
