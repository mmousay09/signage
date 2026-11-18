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
      {children}
    </div>
  );
}
