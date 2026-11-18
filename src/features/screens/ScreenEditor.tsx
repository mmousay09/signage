"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { formatSize, type NamedOption } from "@/features/content/types";
import { createClient } from "@/lib/supabase/browser";
import { isOnline, lastSeenText, type ScreenRow } from "./types";
import { useScreenCommand } from "./useScreenCommand";

const audioText = { ready: "يعمل", blocked: "يحتاج لمسة على الشاشة", unknown: "لم يُختبر بعد" };

function contentText(screen: ScreenRow) {
  const content = screen.player_state?.content;
  if (content?.status === "downloading") return `جارٍ التنزيل ${content.ready ?? 0} من ${content.total ?? 0}`;
  if (content?.status === "error") return "تعذر التنزيل، وستعاد المحاولة";
  if (content?.status === "ready") return "محفوظ وجاهز دون إنترنت";
  return "لم يبدأ بعد";
}

export function ScreenEditor({
  screen,
  playlists,
  layouts,
}: {
  screen: ScreenRow;
  playlists: NamedOption[];
  layouts: NamedOption[];
}) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = isOnline(screen, now);
  const command = useScreenCommand(screen, online);
  const disabled = screen.status === "disabled";
  const state = screen.player_state;

  useEffect(() => setNow(Date.now()), []);

  async function update(
    values: Partial<Pick<ScreenRow, "name" | "location" | "status" | "playlist_id" | "layout_id">>,
    done: string,
  ) {
    setBusy(true);
    const { error } = await createClient().from("screens").update(values).eq("id", screen.id);
    if (!error && ("playlist_id" in values || "layout_id" in values)) await command.send("resync");
    setBusy(false);
    setMessage(error ? "لم يُحفظ التغيير. تأكد من الاتصال." : done);
    if (!error) router.refresh();
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void update(
      {
        name: String(form.get("name")).trim(),
        location: String(form.get("location")).trim() || null,
        playlist_id: String(form.get("playlist_id")) || null,
        layout_id: String(form.get("layout_id")) || null,
      },
      "حُفظت البيانات وأُرسلت إلى الشاشة",
    );
  }

  return (
    <main className="page">
      <h1>{screen.name ?? "شاشة بلا اسم"}</h1>
      <dl className="facts">
        <div><dt>الحالة</dt><dd>{disabled ? "موقوفة" : online ? "متصلة" : lastSeenText(screen, now) || "غير متصلة"}</dd></div>
        <div><dt>الصوت</dt><dd>{audioText[state?.audio ?? "unknown"]}</dd></div>
        <div><dt>ملء الشاشة</dt><dd>{state?.fullscreen ? "مفعّل" : "غير مفعّل"}</dd></div>
        <div><dt>إبقاء الشاشة مضاءة</dt><dd>{state?.wake_lock ? "مفعّل" : "غير مفعّل"}</dd></div>
        <div><dt>الدقة</dt><dd dir="ltr">{state?.display ?? "غير معروفة"}</dd></div>
        <div><dt>المحتوى</dt><dd>{contentText(screen)}</dd></div>
        {screen.cached_bytes !== null && (
          <div><dt>المساحة المستخدمة</dt><dd dir="ltr">{formatSize(screen.cached_bytes)}</dd></div>
        )}
      </dl>

      {!disabled && (
        <div className="action-pair">
          <button disabled={command.busy} onClick={() => command.send("reload")}>إعادة تحميل</button>
          <button disabled={command.busy} onClick={() => command.send("identify")}>تعريف الشاشة</button>
        </div>
      )}
      {command.message && <p className="page-note" role="status">{command.message}</p>}

      <form className="form" onSubmit={save}>
        <label>
          اسم الشاشة
          <input name="name" required maxLength={80} defaultValue={screen.name ?? ""} />
        </label>
        <label>
          الموقع
          <input name="location" maxLength={120} defaultValue={screen.location ?? ""} />
        </label>
        <label>
          قائمة العرض
          <select name="playlist_id" defaultValue={screen.playlist_id ?? ""}>
            <option value="">دون قائمة</option>
            {playlists.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>{playlist.name}</option>
            ))}
          </select>
        </label>
        <label>
          تقسيم الشاشة
          <select name="layout_id" defaultValue={screen.layout_id ?? ""}>
            <option value="">المحتوى بملء الشاشة</option>
            {layouts.map((layout) => (
              <option key={layout.id} value={layout.id}>{layout.name}</option>
            ))}
          </select>
        </label>
        <button className="button-primary" disabled={busy}>حفظ البيانات</button>
      </form>

      {message && <p className="page-note" role="status">{message}</p>}

      <button
        className="button-quiet"
        disabled={busy}
        onClick={() =>
          update(
            { status: disabled ? "active" : "disabled" },
            disabled ? "شُغّلت الشاشة" : "أُوقفت الشاشة",
          )
        }
      >
        {disabled ? "تشغيل الشاشة" : "إيقاف الشاشة"}
      </button>
    </main>
  );
}
