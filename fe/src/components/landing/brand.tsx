import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/landing/logo.svg";

export function Brand({ size = "md", href = "#top" }: { size?: "sm" | "md"; href?: string }) {
  const small = size === "sm";
  return (
    <Link
      href={href}
      aria-label="Mashpit home"
      className={`inline-flex items-center gap-2.5 font-display font-semibold italic leading-none text-accent ${
        small ? "py-1.5 text-lg" : "text-2xl"
      }`}
    >
      <Image src={logo} alt="" className={small ? "h-5 w-auto" : "h-7 w-auto"} unoptimized />
      Mashpit
    </Link>
  );
}
