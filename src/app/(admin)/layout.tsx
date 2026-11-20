import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/features/screens/SignOutButton";
import { getAdminContext } from "@/lib/admin";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { org } = await getAdminContext();
  return (
    <div className="admin">
      <header className="admin-header">
        <Link href="/dashboard">{org.name}</Link>
        <div className="admin-header-actions">
          <Link href="/settings">الإعدادات</Link>
          <SignOutButton />
        </div>
      </header>
      <nav className="admin-nav" aria-label="أقسام لوحة التحكم">
        <Link href="/dashboard">الشاشات</Link>
        <Link href="/contracts">العقود</Link>
        <Link href="/playlists">القوائم</Link>
        <Link href="/media">الوسائط</Link>
        <Link href="/announcements">الإعلانات</Link>
      </nav>
      {children}
    </div>
  );
}
