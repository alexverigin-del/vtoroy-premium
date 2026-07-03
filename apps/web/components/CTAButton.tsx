import Link from "next/link";
import { cn } from "../lib/cn";

type Variant = "primary" | "secondary" | "ghost";

const styles: Record<Variant, string> = {
  primary: "bg-action text-white hover:bg-action-blue",
  secondary: "border border-link-blue text-link-blue hover:bg-link-blue/5",
  ghost: "text-link-blue hover:underline",
};

export function CTAButton({
  href,
  label,
  variant = "primary",
}: {
  href: string;
  label: string;
  variant?: Variant;
}) {
  const base =
    "inline-flex min-h-11 items-center justify-center rounded-pill px-7 py-3 font-medium outline-none transition focus-visible:shadow-focus";
  return (
    <Link href={href} className={cn(base, styles[variant])}>
      {label}
    </Link>
  );
}
