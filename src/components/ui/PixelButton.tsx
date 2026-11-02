import type { ButtonHTMLAttributes } from "react";

const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-pumpkin)]";

export function PixelButton({
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`border-2 border-ghost-white bg-bg-panel px-3 py-2 text-[10px] uppercase leading-relaxed text-ghost-white active:translate-y-px active:border-ghost-dim disabled:border-ghost-dim disabled:text-ghost-dim ${focus} ${className}`}
      {...props}
    />
  );
}
