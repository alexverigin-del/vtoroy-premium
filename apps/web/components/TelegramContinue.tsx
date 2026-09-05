import { submitButtonClass } from "./ui-classes";

export function TelegramContinue({ url }: { url?: string }) {
  return url ? (
    <a href={url} className={submitButtonClass}>
      Продолжить в Telegram
    </a>
  ) : null;
}
