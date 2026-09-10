import { submitButtonClass } from "./ui-classes";

type Link = { platform: "telegram" | "max" | "vk"; label: string; url: string };

export function TelegramContinue({ links = [] }: { links?: Link[] }) {
  return links.map((link) => (
    <a key={link.url} href={link.url} className={submitButtonClass}>
      Продолжить в {link.label}
    </a>
  ));
}
