"use client";

import { PixelButton } from "@/components/ui/PixelButton";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { ReminderState } from "@/components/providers/GameStateProvider";

/**
 * The only place that asks for notification permission, and only on a press.
 * Renders nothing when this browser or deploy cannot push.
 */
export function ReminderToggle({
  state,
  pending,
  onEnable,
  onDisable,
}: {
  state: ReminderState;
  pending: boolean;
  onEnable: () => void;
  onDisable: () => void;
}) {
  const { t } = useLocale();
  if (state === "unavailable") return null;

  return (
    <div className="mt-6 flex flex-col items-start gap-2">
      {state === "blocked" ? null : (
        <PixelButton
          aria-pressed={state === "on"}
          aria-disabled={pending || undefined}
          className={pending ? "border-ghost-dim text-ghost-dim" : ""}
          onClick={() => {
            if (pending) return;
            if (state === "on") onDisable();
            else onEnable();
          }}
        >
          {state === "on" ? t.reminders.on : t.reminders.enable}
        </PixelButton>
      )}
      <p className="text-[8px] leading-relaxed text-ghost-dim">
        {state === "blocked" ? t.reminders.blocked : t.reminders.hint}
      </p>
    </div>
  );
}
