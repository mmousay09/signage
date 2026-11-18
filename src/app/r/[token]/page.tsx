import type { Metadata } from "next";
import { RenterPortal } from "@/features/renter/RenterPortal";

export const metadata: Metadata = {
  title: "محتوى الشاشات",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function RenterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <RenterPortal token={token} />;
}
