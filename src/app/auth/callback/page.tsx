"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";

// رابط البريد يحمل الجلسة بعد علامة #، فيعمل حتى لو فُتح في متصفح آخر على الهاتف
export default function AuthCallbackPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    window.history.replaceState(null, "", window.location.pathname);

    if (!accessToken || !refreshToken) {
      window.location.replace("/login?link_error=1");
      return;
    }

    void createClient()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        window.location.replace(error ? "/login?link_error=1" : "/dashboard");
      });
  }, []);

  return (
    <main className="auth">
      <h1>جارٍ تسجيل الدخول</h1>
    </main>
  );
}
