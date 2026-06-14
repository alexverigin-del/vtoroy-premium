import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost";

const styles: Record<Variant, string> = {
  primary: "bg-accent text-white hover:opacity-90",
  secondary: "border border-accent text-accent hover:bg-accent/5",
  ghost: "text-accent hover:underline",
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
    "inline-flex items-center justify-center rounded-pill px-7 py-3 font-medium transition";
  return (
    <Link href={href} className={`${base} ${styles[variant]}`}>
      {label}
    </Link>
  );
}
