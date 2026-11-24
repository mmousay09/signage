import type { Metadata } from "next";
import { Readex_Pro } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  variable: "--font-readex",
  display: "swap",
});

export const metadata: Metadata = {
  title: "لوحة الشاشات",
  description: "إدارة وتأجير الشاشات الدعائية",
  icons: { icon: "/icons/icon-192.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={readex.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
