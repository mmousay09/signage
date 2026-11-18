import type { Metadata, Viewport } from "next";
import { PlayerApp } from "@/player/PlayerApp";

export const metadata: Metadata = {
  title: "مشغّل الشاشة",
  manifest: "/player.webmanifest",
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: "#FFC72C",
  width: "device-width",
  initialScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function PlayPage() {
  return <PlayerApp />;
}
