import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Server composition can resolve arbitrary utility overrides. In client components,
// use clsx for mutually exclusive variants and CSS component defaults for overrides:
// shipping the full Tailwind conflict map is unnecessary there.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
