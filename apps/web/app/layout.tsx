import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "./site.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://isvoi.ru"),
  title: "ISVOI — клуб разумного владения",
  description:
    "ISVOI — клуб разумного владения. Хорошие вещи проходят через своих: с ISVOI Passport, гарантией и понятной ценой выхода. Будущий сайт на Next.js + Directus.",
  openGraph: {
    type: "website",
    siteName: "ISVOI",
    title: "ISVOI — клуб разумного владения",
    description:
      "Проверенные вещи с ISVOI Passport, гарантией и понятной ценой выхода.",
    url: "https://isvoi.ru",
  },
  twitter: {
    card: "summary",
    title: "ISVOI — клуб разумного владения",
    description:
      "Проверенные вещи с ISVOI Passport, гарантией и понятной ценой выхода.",
  },
  icons: {
    icon: [
      {
        url: "/favicon.svg",
        type: "image/svg+xml",
      },
    ],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  return (
    <html lang="ru">
      <body>
        {children}
        {turnstileEnabled ? (
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
          />
        ) : null}
      </body>
    </html>
  );
}
