import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { OfflineAlerts } from "@/features/alerts/OfflineAlerts";
import { AdminTranslator, EARLY_SCRIPT, LanguageToggle } from "@/features/i18n/AdminTranslator";
import { AdminNav } from "@/features/navigation/AdminNav";
import { SignOutButton } from "@/features/screens/SignOutButton";
import { getAdminContext } from "@/lib/admin";

// تثبيت لوحة التحكم على الشاشة الرئيسية للهاتف كتطبيق
export const metadata: Metadata = {
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, title: "الشاشات", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { org, role } = await getAdminContext();
  const readOnly = role === "viewer";
  const canManage = role === "owner" || role === "admin";
  return (
    <div className="admin" data-readonly={readOnly || undefined}>
      <script dangerouslySetInnerHTML={{ __html: EARLY_SCRIPT }} />
      <AdminTranslator />
      <header className="admin-header">
        <Link href="/dashboard">{org.name}</Link>
        <div className="admin-header-actions">
          <LanguageToggle />
          <Link href="/team">الفريق</Link>
          {canManage && <Link href="/settings">الإعدادات</Link>}
          <SignOutButton />
        </div>
      </header>
      <AdminNav />
      <OfflineAlerts orgId={org.id} />
      {readOnly && <p className="readonly-note">صلاحيتك مشاهدة فقط: ترى كل شيء ولا تستطيع التغيير.</p>}
      {children}
    </div>
  );
}
