import Link from "next/link";
import type { ComponentProps } from "react";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full border font-bold transition-[background-color,border-color,transform] duration-200 active:translate-y-px";

const variants = {
  primary: "border-transparent bg-accent text-accent-ink hover:bg-accent-hover",
  ghost: "border-line-strong text-ink hover:border-ink-3 hover:bg-surface",
} as const;

const sizes = {
  sm: "px-[18px] py-2.5 text-sm",
  md: "px-[22px] py-[13px] text-[15px]",
} as const;

type Props = ComponentProps<typeof Link> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function ButtonLink({ variant = "primary", size = "md", className = "", ...props }: Props) {
  return (
    <Link className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />
  );
}
