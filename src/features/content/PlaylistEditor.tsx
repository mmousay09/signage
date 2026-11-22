"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";
import { MediaThumb } from "./MediaThumb";
import type { AssignableScreen, MediaAsset, NamedOption, PlaylistItem } from "./types";

const DEFAULT_SECONDS = 8;

export function PlaylistEditor({
  orgId,
  playlist,
  contractId,
  items,
  assets,
  screens,
}: {
  orgId: string;
  playlist: NamedOption;
  contractId: string | null;
  items: PlaylistItem[];
  assets: MediaAsset[];
  screens: AssignableScreen[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const inList = new Set(items.map((item) => item.asset_id).filter(Boolean));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const nextPosition = Math.max(0, ...items.map((item) => item.position)) + 1;

  async function run(action: () => PromiseLike<{ error: unknown }>, done?: string) {
    setBusy(true);
    const { error } = await action();
    setBusy(false);
    setStatus(error ? "لم يُحفظ التغيير. تأكد من الاتصال." : (done ?? null));
    if (!error) router.refresh();
  }

  const supabase = () => createClient();

  function toggleChosen(id: string) {
    setChosen((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  // تُضاف كل المواد المختارة دفعة واحدة، بترتيب اختيارها
  function addChosen() {
    const picked = chosen.map((id) => assetById.get(id)).filter((asset): asset is MediaAsset => Boolean(asset));
    if (!picked.length) return;
    setPicking(false);
    setChosen([]);
    void run(
      () =>
        supabase()
          .from("playlist_items")
          .insert(
            picked.map((asset, index) => ({
              org_id: orgId,
              playlist_id: playlist.id,
              position: nextPosition + index,
              kind: asset.kind,
              asset_id: asset.id,
              duration_ms: asset.kind === "image" ? DEFAULT_SECONDS * 1000 : null,
            })),
          ),
      picked.length === 1 ? "أُضيفت مادة واحدة" : `أُضيفت ${picked.length} مواد`,
    );
  }

  function addText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body")).trim();
    void run(() =>
      supabase().from("playlist_items").insert({
        org_id: orgId,
        playlist_id: playlist.id,
        position: nextPosition,
        kind: "text",
        body,
        duration_ms: DEFAULT_SECONDS * 1000,
      }),
    );
    form.reset();
  }

  function move(index: number, offset: number) {
    const ids = items.map((item) => item.id);
    const target = index + offset;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(() => supabase().rpc("reorder_playlist", { p_playlist: playlist.id, p_items: ids }));
  }

  function setSeconds(item: PlaylistItem, value: string) {
    const seconds = Math.min(600, Math.max(1, Number(value) || DEFAULT_SECONDS));
    if (seconds * 1000 === item.duration_ms) return;
    void run(() =>
      supabase().from("playlist_items").update({ duration_ms: seconds * 1000 }).eq("id", item.id),
    );
  }

  function toggleScreen(screen: AssignableScreen) {
    const showing = screen.playlist_id === playlist.id;
    void run(async () => {
      const client = supabase();
      const { error } = await client
        .from("screens")
        .update({ playlist_id: showing ? null : playlist.id })
        .eq("id", screen.id);
      if (error) return { error };
      return client
        .from("screen_commands")
        .insert({ org_id: orgId, screen_id: screen.id, command: "resync" });
    }, showing ? "أُوقف عرض القائمة على الشاشة" : "أُرسلت القائمة إلى الشاشة");
  }

  async function publish() {
    setBusy(true);
    const { data, error } = contractId
      ? await supabase().rpc("request_contract_resync", { p_contract: contractId })
      : await supabase().rpc("request_playlist_resync", { p_playlist: playlist.id });
    setBusy(false);
    setStatus(
      error
        ? "تعذر إرسال التحديث."
        : data
          ? `أُرسل التحديث إلى ${data} ${data === 1 ? "شاشة" : "شاشات"}`
          : "لا توجد شاشة مرتبطة بهذه القائمة بعد.",
    );
  }

  return (
    <main className="page">
      <p className="page-note">
        <Link href={contractId ? `/contracts/${contractId}` : "/playlists"}>
          {contractId ? "العودة إلى العقد" : "قوائم العرض"}
        </Link>
      </p>
      <h1>{playlist.name}</h1>

      {items.length === 0 ? (
        <p className="board-empty">القائمة فارغة. أضف صورة أو فيديو أو نصًا.</p>
      ) : (
        <ol className="playlist-items">
          {items.map((item, index) => {
            const asset = item.asset_id ? assetById.get(item.asset_id) : undefined;
            return (
              <li key={item.id}>
                {asset ? <MediaThumb asset={asset} /> : <div className="thumb thumb-text">نص</div>}
                <div className="item-main">
                  <strong>{asset?.name ?? item.body ?? "ملف"}</strong>
                  {item.kind === "video" ? (
                    <span>يعمل حتى نهاية الفيديو</span>
                  ) : (
                    <label>
                      المدة بالثواني
                      <input
                        type="number"
                        min={1}
                        max={600}
                        inputMode="numeric"
                        defaultValue={(item.duration_ms ?? DEFAULT_SECONDS * 1000) / 1000}
                        onBlur={(event) => setSeconds(item, event.target.value)}
                      />
                    </label>
                  )}
                </div>
                <div className="item-actions">
                  <button aria-label="نقل لأعلى" disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button>
                  <button aria-label="نقل لأسفل" disabled={busy || index === items.length - 1} onClick={() => move(index, 1)}>↓</button>
                  <button
                    aria-label="حذف من القائمة"
                    disabled={busy}
                    onClick={() => run(() => supabase().from("playlist_items").delete().eq("id", item.id))}
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <button
        className="button-scan"
        type="button"
        onClick={() => {
          setPicking((value) => !value);
          setChosen([]);
        }}
      >
        {picking ? "إغلاق المكتبة" : "إضافة صور أو فيديوهات"}
      </button>
      {picking &&
        (assets.length === 0 ? (
          <p className="page-note">
            المكتبة فارغة. <Link href="/media">ارفع ملفًا أولًا</Link>
          </p>
        ) : (
          <section className="picker" aria-label="اختيار من المكتبة">
            <div className="picker-bar">
              <span>اضغط على الصور لاختيارها، ثم أضفها كلها مرة واحدة.</span>
              <button
                type="button"
                onClick={() => setChosen(chosen.length === assets.length ? [] : assets.map((asset) => asset.id))}
              >
                {chosen.length === assets.length ? "إلغاء الكل" : "اختر الكل"}
              </button>
            </div>
            <ul className="media-grid">
              {assets.map((asset) => {
                const order = chosen.indexOf(asset.id);
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      className="pick"
                      aria-pressed={order >= 0}
                      disabled={busy}
                      onClick={() => toggleChosen(asset.id)}
                    >
                      <MediaThumb asset={asset} />
                      {order >= 0 && <span className="pick-mark">{order + 1}</span>}
                      <strong>{asset.name}</strong>
                      {inList.has(asset.id) && <small>موجودة في القائمة</small>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="picker-submit">
              <button className="button-primary" type="button" disabled={busy || chosen.length === 0} onClick={addChosen}>
                {chosen.length ? `إضافة ${chosen.length} إلى القائمة` : "اختر صورة أو أكثر"}
              </button>
            </div>
          </section>
        ))}

      <form className="form" onSubmit={addText}>
        <label>
          إضافة نص
          <textarea name="body" required maxLength={500} rows={3} placeholder="أهلًا بكم في المعرض" />
        </label>
        <button className="button-quiet-blue" disabled={busy}>إضافة النص</button>
      </form>

      {!contractId && (
        <section className="assign-section">
          <h2>اعرض هذه القائمة على</h2>
          {screens.length === 0 ? (
            <p className="page-note">لا توجد شاشات مربوطة بعد.</p>
          ) : (
            <ul className="assign-list">
              {screens.map((screen) => {
                const showing = screen.playlist_id === playlist.id;
                return (
                  <li key={screen.id}>
                    <span>{screen.name ?? "شاشة بلا اسم"}</span>
                    <button
                      className={showing ? "button-quiet-blue" : "button-scan"}
                      disabled={busy}
                      onClick={() => toggleScreen(screen)}
                    >
                      {showing ? "إيقاف" : "عرض"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {status && <p className="page-note" role="status">{status}</p>}
      <button className="button-primary" disabled={busy} onClick={publish}>تحديث الشاشات الآن</button>
    </main>
  );
}
