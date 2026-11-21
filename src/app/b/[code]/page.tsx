import type { Metadata } from "next";
import { GuestBadge } from "@/features/badge/GuestBadge";

export const metadata: Metadata = {
  title: "بطاقة الضيف",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function BadgePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <GuestBadge code={code.toUpperCase()} />;
}
