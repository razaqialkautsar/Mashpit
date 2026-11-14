import Image from "next/image";
import logo from "@/assets/landing/logo.svg";

export function Brand({ size = "md" }: { size?: "sm" | "md" }) {
  const small = size === "sm";
  return (
    <a
      href="#top"
      aria-label="Mashpit home"
      className={`inline-flex items-center gap-2.5 font-display font-semibold italic leading-none text-accent ${
        small ? "py-1.5 text-lg" : "text-2xl"
      }`}
    >
      <Image src={logo} alt="" className={small ? "h-5 w-auto" : "h-7 w-auto"} unoptimized />
      Mashpit
    </a>
  );
}
