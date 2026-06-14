import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Второй Премиум — Не новый. Проверенный.",
  description:
    "Премиальная техника Apple с Паспортом Премиума, гарантией и понятной ценой выхода. Будущий сайт на Next.js + Directus.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
