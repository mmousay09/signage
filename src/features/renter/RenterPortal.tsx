"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { formatDateTime } from "@/features/contracts/format";
import { getRenterClient } from "@/lib/supabase/renter";

const MAX_BYTES = 50 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const DEFAULT_MS = 8_000;

interface Contract {
  id: string;
  org_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
}

interface Item {
  id: string;
  position: number;
  kind: string;
  body: string | null;
  asset_id: string | null;
  duration_ms: number | null;
}

interface Asset {
  id: string;
  storage_path: string;
  url: string | null;
}

interface PortalData {
  contract: Contract;
  playlistId: string;
  screens: string[];
  items: Item[];
  assets: Record<string, Asset>;
}

async function loadPortal(token: string): Promise<PortalData> {
  const supabase = getRenterClient();
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session.session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }
  const { data: contractId, error } = await supabase.rpc("redeem_renter_invite", { p_token: token });
  if (error) throw error;

  const [{ data: contract }, { data: playlist }, { data: links }] = await Promise.all([
    supabase.from("contracts").select("id, org_id, title, starts_at, ends_at, status").eq("id", contractId).single(),
    supabase.from("playlists").select("id").eq("contract_id", contractId).order("created_at").limit(1).single(),
    supabase.from("contract_screens").select("screen_id").eq("contract_id", contractId),
  ]);
  if (!contract || !playlist) throw new Error("not_found");

  const screenIds = ((links ?? []) as { screen_id: string }[]).map((link) => link.screen_id);
  const [{ data: items }, { data: screens }, { data: assets }] = await Promise.all([
    supabase.from("playlist_items").select("id, position, kind, body, asset_id, duration_ms").eq("playlist_id", playlist.id).order("position"),
    supabase.from("screens").select("name").in("id", screenIds),
    supabase.from("media_assets").select("id, storage_path").eq("contract_id", contractId),
  ]);

  const assetRows = (assets ?? []) as { id: string; storage_path: string }[];
  const urls = new Map<string, string>();
  if (assetRows.length) {
    const { data: signed } = await supabase.storage
      .from("media")
      .createSignedUrls(assetRows.map((asset) => asset.storage_path), 3600);
    (signed ?? []).forEach((entry) => {
      if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl);
    });
  }

  return {
    contract: contract as Contract,
    playlistId: playlist.id as string,
    screens: ((screens ?? []) as { name: string | null }[]).map((screen) => screen.name ?? "شاشة"),
    items: (items ?? []) as Item[],
    assets: Object.fromEntries(
      assetRows.map((asset) => [asset.id, { ...asset, url: urls.get(asset.storage_path) ?? null }]),
    ),
  };
}

export function RenterPortal({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await loadPortal(token));
      setNow(Date.now());
    } catch {
      setFailed(true);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (failed) {
    return (
      <main className="auth">
        <h1>الرابط غير صالح</h1>
        <p className="page-note">انتهت صلاحية هذا الرابط أو أُلغي. اطلب رابطًا جديدًا من الشركة.</p>
      </main>
    );
  }
  if (!data) return <main className="auth"><h1>جارٍ التحميل</h1></main>;

  const { contract, items, assets, playlistId } = data;
  const canEdit =
    contract.status === "confirmed" &&
    now >= Date.parse(contract.starts_at) &&
    now < Date.parse(contract.ends_at);
  const supabase = getRenterClient();
  const nextPosition = Math.max(0, ...items.map((item) => item.position)) + 1;

  async function run(action: () => PromiseLike<{ error: unknown }>, done: string) {
    setBusy(true);
    setMessage(null);
    const { error } = await action();
    if (error) {
      setMessage("لم يُحفظ التغيير. تأكد من الاتصال وحاول مرة أخرى.");
    } else {
      await supabase.rpc("request_contract_resync", { p_contract: contract.id });
      await refresh();
      setMessage(done);
    }
    setBusy(false);
  }

  function addText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body")).trim();
    form.reset();
    void run(
      () =>
        supabase.from("playlist_items").insert({
          org_id: contract.org_id,
          playlist_id: playlistId,
          position: nextPosition,
          kind: "text",
          body,
          duration_ms: DEFAULT_MS,
        }),
      "أُضيف النص وأُرسل إلى الشاشات",
    );
  }

  function addImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const extension = IMAGE_TYPES[file.type];
    if (!extension || file.size > MAX_BYTES) {
      setMessage("اختر صورة JPG أو PNG أو WebP حجمها أقل من 50MB.");
      return;
    }
    void run(async () => {
      const assetId = crypto.randomUUID();
      const path = `${contract.org_id}/${contract.id}/${assetId}.${extension}`;
      const upload = await supabase.storage.from("media").upload(path, file, { contentType: file.type });
      if (upload.error) return { error: upload.error };
      const asset = await supabase.from("media_assets").insert({
        id: assetId,
        org_id: contract.org_id,
        contract_id: contract.id,
        kind: "image",
        name: file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (asset.error) {
        await supabase.storage.from("media").remove([path]);
        return { error: asset.error };
      }
      return supabase.from("playlist_items").insert({
        org_id: contract.org_id,
        playlist_id: playlistId,
        position: nextPosition,
        kind: "image",
        asset_id: assetId,
        duration_ms: DEFAULT_MS,
      });
    }, "أُضيفت الصورة وأُرسلت إلى الشاشات");
  }

  function saveText(item: Item, body: string) {
    const value = body.trim();
    if (!value || value === item.body) return;
    void run(() => supabase.from("playlist_items").update({ body: value }).eq("id", item.id), "حُفظ النص");
  }

  function move(index: number, offset: number) {
    const ids = items.map((item) => item.id);
    const target = index + offset;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(() => supabase.rpc("reorder_playlist", { p_playlist: playlistId, p_items: ids }), "حُفظ الترتيب");
  }

  function remove(item: Item) {
    void run(async () => {
      const result = await supabase.from("playlist_items").delete().eq("id", item.id);
      const asset = item.asset_id ? assets[item.asset_id] : undefined;
      if (!result.error && asset) {
        const deleted = await supabase.from("media_assets").delete().eq("id", asset.id);
        if (!deleted.error) await supabase.storage.from("media").remove([asset.storage_path]);
      }
      return result;
    }, "حُذف العنصر");
  }

  return (
    <div className="admin">
      <header className="admin-header"><span>{contract.title}</span></header>
      <main className="page">
        <h1>محتوى شاشاتك</h1>
        <p className="page-note">{data.screens.join("، ") || "لم تُحدد شاشات بعد"}</p>
        <p className="page-note">
          {canEdit
            ? `يمكنك التعديل حتى ${formatDateTime(contract.ends_at)}`
            : `التعديل متاح من ${formatDateTime(contract.starts_at)} إلى ${formatDateTime(contract.ends_at)}`}
        </p>

        {items.length === 0 ? (
          <p className="board-empty">لا يوجد محتوى بعد.</p>
        ) : (
          <ol className="playlist-items">
            {items.map((item, index) => {
              const asset = item.asset_id ? assets[item.asset_id] : undefined;
              const editable = canEdit && (item.kind === "text" || (item.kind === "image" && Boolean(asset)));
              return (
                <li key={item.id}>
                  {asset?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="thumb" src={asset.url} alt="" />
                  ) : (
                    <div className="thumb thumb-text">{item.kind === "text" ? "نص" : "ملف"}</div>
                  )}
                  <div className="item-main">
                    {item.kind === "text" && editable ? (
                      <textarea
                        className="renter-text"
                        aria-label="نص العرض"
                        maxLength={500}
                        defaultValue={item.body ?? ""}
                        onBlur={(event) => saveText(item, event.target.value)}
                      />
                    ) : (
                      <strong>{item.body ?? (asset ? "صورة" : "من إدارة الشاشات")}</strong>
                    )}
                  </div>
                  {editable && (
                    <div className="item-actions">
                      <button aria-label="نقل لأعلى" disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button>
                      <button aria-label="نقل لأسفل" disabled={busy || index === items.length - 1} onClick={() => move(index, 1)}>↓</button>
                      <button aria-label="حذف" disabled={busy} onClick={() => remove(item)}>×</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {canEdit && (
          <>
            <label className="button-scan upload-button" aria-disabled={busy}>
              إضافة صورة
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={addImage} />
            </label>
            <form className="form" onSubmit={addText}>
              <label>
                إضافة نص
                <textarea name="body" required maxLength={500} rows={3} />
              </label>
              <button className="button-primary" disabled={busy}>إضافة النص</button>
            </form>
          </>
        )}
        {message && <p className="page-note" role="status">{message}</p>}
      </main>
    </div>
  );
}
