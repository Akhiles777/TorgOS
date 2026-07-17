import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ТоргОС",
  description: "Касса и учёт для магазина",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="h-full">
      <body className="min-h-full flex flex-col bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
