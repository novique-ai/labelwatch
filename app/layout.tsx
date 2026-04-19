import type { Metadata } from "next";
import { Fraunces, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz", "SOFT"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LabelWatch — FDA recall intelligence for supplement brands",
  description:
    "Multi-channel notifications, peer watch, and ingredient-level filtering on every FDA dietary supplement recall. From $39/mo. By Novique.ai.",
  metadataBase: new URL("https://label.watch"),
  openGraph: {
    title: "LabelWatch — FDA recall intelligence for supplement brands",
    description:
      "FDA gives you 5 keywords. We give you the whole shelf — Slack, Teams, webhooks, peer-watch, ingredient filters. From $39/mo.",
    url: "https://label.watch",
    siteName: "LabelWatch",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LabelWatch — FDA recall intelligence for supplement brands",
    description:
      "FDA gives you 5 keywords. We give you the whole shelf. From $39/mo.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${manrope.variable} ${jetbrains.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
