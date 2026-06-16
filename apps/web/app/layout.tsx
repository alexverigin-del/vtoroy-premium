import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ISVOI — клуб разумного владения",
  description:
    "ISVOI — клуб разумного владения. Хорошие вещи проходят через своих: с ISVOI Passport, гарантией и понятной ценой выхода. Будущий сайт на Next.js + Directus.",
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
