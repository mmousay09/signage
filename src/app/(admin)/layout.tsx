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
        <SignOutButton />
      </header>
      <nav className="admin-nav" aria-label="أقسام لوحة التحكم">
        <Link href="/dashboard">الشاشات</Link>
        <Link href="/playlists">قوائم العرض</Link>
        <Link href="/media">الوسائط</Link>
      </nav>
      {children}
    </div>
  );
}
