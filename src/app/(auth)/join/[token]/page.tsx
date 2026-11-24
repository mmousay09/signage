"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const ERRORS: Record<string, string> = {
  invite_invalid: "انتهت صلاحية هذه الدعوة أو أُلغيت. اطلب من صاحب الحساب رابطًا جديدًا.",
  invite_used: "استُخدمت هذه الدعوة من حساب آخر. اطلب رابطًا جديدًا.",
  other_organization: "حسابك مرتبط بشركة أخرى، فلا يمكن ضمه لهذا الفريق.",
};

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void createClient()
      .rpc("accept_team_invite", { p_token: token })
      .then(({ error: rpcError }) => {
        if (!rpcError) {
          router.replace("/dashboard");
          router.refresh();
          return;
        }
        const key = Object.keys(ERRORS).find((code) => rpcError.message.includes(code));
        setError(key ? ERRORS[key] : "تعذر قبول الدعوة. تأكد من الاتصال وحاول مرة أخرى.");
      });
  }, [token, router]);

  return (
    <main className="auth">
      <h1>الانضمام إلى الفريق</h1>
      {error ? (
        <>
          <p className="form-error" role="alert">{error}</p>
          <Link href="/dashboard">الذهاب إلى لوحة التحكم</Link>
        </>
      ) : (
        <p className="page-note">جارٍ قبول الدعوة</p>
      )}
    </main>
  );
}
