"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { NamedOption } from "./types";

export function PlaylistList({ orgId, playlists }: { orgId: string; playlists: NamedOption[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    const { data, error: insertError } = await createClient()
      .from("playlists")
      .insert({ org_id: orgId, name })
      .select("id")
      .single();
    setBusy(false);
    if (insertError || !data) {
      setError("تعذر إنشاء القائمة. حاول مرة أخرى.");
      return;
    }
    router.push(`/playlists/${data.id}`);
  }

  return (
    <main className="page">
      <h1>قوائم العرض</h1>
      <form className="form" onSubmit={create}>
        <label>
          اسم قائمة جديدة
          <input name="name" required maxLength={80} placeholder="إعلانات المعرض" />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button-primary" disabled={busy}>إنشاء القائمة</button>
      </form>
      {playlists.length === 0 ? (
        <p className="board-empty">لا توجد قوائم بعد.</p>
      ) : (
        <ul className="link-list">
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <Link href={`/playlists/${playlist.id}`}>{playlist.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
