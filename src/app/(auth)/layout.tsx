import type { ReactNode } from "react";
import { AdminTranslator, EARLY_SCRIPT, LanguageToggle } from "@/features/i18n/AdminTranslator";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: EARLY_SCRIPT }} />
      <AdminTranslator />
      <div className="auth-language">
        <LanguageToggle />
      </div>
      {children}
    </>
  );
}
