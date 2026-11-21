"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";
import { contractState, toLocalInput, type ContractStatus } from "./format";
import { KioskSettings, type AgendaRow, type GuestRow, type KioskConfig } from "./KioskSettings";

export interface ContractDetails {
  id: string;
  org_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: ContractStatus;
  client_name: string;
  client_phone: string | null;
}

interface DbError {
  code?: string;
}

const describeError = (error: DbError) =>
  error.code === "23P01"
    ? "إحدى الشاشات محجوزة في نفس الفترة بعقد مؤكد آخر."
    : "لم يُحفظ التغيير. تأكد من الاتصال وحاول مرة أخرى.";

export function ContractDetail({
  contract,
  playlistId,
  screens,
  assigned,
  kiosk,
  images,
  agenda,
  guests,
}: {
  contract: ContractDetails;
  playlistId: string | null;
  screens: { id: string; name: string | null }[];
  assigned: string[];
  kiosk: KioskConfig;
  images: { id: string; name: string }[];
  agenda: AgendaRow[];
  guests: GuestRow[];
}) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const assignedSet = new Set(assigned);

  useEffect(() => setNow(Date.now()), []);

  async function apply(action: () => PromiseLike<{ error: DbError | null }>, done: string) {
    setBusy(true);
    setMessage(null);
    const { error } = await action();
    if (error) {
      setMessage(describeError(error));
    } else {
      await createClient().rpc("request_contract_resync", { p_contract: contract.id });
      setMessage(done);
      router.refresh();
    }
    setBusy(false);
  }

  function toggleScreen(screenId: string) {
    const client = createClient();
    void apply(
      () =>
        assignedSet.has(screenId)
          ? client.from("contract_screens").delete().eq("contract_id", contract.id).eq("screen_id", screenId)
          : client
              .from("contract_screens")
              .insert({ contract_id: contract.id, screen_id: screenId, org_id: contract.org_id }),
      "حُدّثت شاشات العقد",
    );
  }

  function setStatus(status: ContractStatus, done: string) {
    void apply(() => createClient().from("contracts").update({ status }).eq("id", contract.id), done);
  }

  function saveDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startsAt = new Date(String(form.get("starts_at")));
    const endsAt = new Date(String(form.get("ends_at")));
    if (endsAt <= startsAt) {
      setMessage("يجب أن تكون نهاية الإيجار بعد بدايته.");
      return;
    }
    void apply(
      () =>
        createClient()
          .from("contracts")
          .update({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
          .eq("id", contract.id),
      "حُفظ موعد الإيجار",
    );
  }

  async function createInvite() {
    setBusy(true);
    const { data, error } = await createClient().rpc("create_renter_invite", { p_contract: contract.id });
    setBusy(false);
    if (error || !data) {
      setMessage("تعذر إنشاء الرابط.");
      return;
    }
    setInviteUrl(`${window.location.origin}/r/${(data as { token: string }).token}`);
    setMessage("أُنشئ الرابط، وأُلغي أي رابط سابق.");
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    if (navigator.share) await navigator.share({ url: inviteUrl }).catch(() => undefined);
    else await navigator.clipboard.writeText(inviteUrl);
  }

  async function revokeAccess() {
    setBusy(true);
    const { error } = await createClient().rpc("revoke_renter_access", { p_contract: contract.id });
    setBusy(false);
    setInviteUrl(null);
    setMessage(error ? "تعذر إلغاء الوصول." : "أُلغي وصول المستأجر.");
  }

  const state = now === null ? null : contractState(contract.status, contract.starts_at, contract.ends_at, now);

  return (
    <main className="page">
      <p className="page-note"><Link href="/contracts">العقود</Link></p>
      <h1>{contract.title}</h1>
      <p className="page-note">
        {contract.client_name}
        {contract.client_phone && <>، <bdi dir="ltr">{contract.client_phone}</bdi></>}
      </p>
      {state && <span className="status-pill" data-state={state.key}>{state.label}</span>}

      {now !== null && (
        <form className="form" onSubmit={saveDates}>
          <label>
            بداية الإيجار
            <input name="starts_at" type="datetime-local" dir="ltr" required defaultValue={toLocalInput(contract.starts_at)} />
          </label>
          <label>
            نهاية الإيجار
            <input name="ends_at" type="datetime-local" dir="ltr" required defaultValue={toLocalInput(contract.ends_at)} />
          </label>
          <button className="button-quiet-blue" disabled={busy}>حفظ الموعد</button>
        </form>
      )}

      <section className="assign-section">
        <h2>شاشات العقد</h2>
        {screens.length === 0 ? (
          <p className="page-note">لا توجد شاشات مربوطة بعد.</p>
        ) : (
          <ul className="assign-list">
            {screens.map((screen) => (
              <li key={screen.id}>
                <span>{screen.name ?? "شاشة بلا اسم"}</span>
                <button
                  className={assignedSet.has(screen.id) ? "button-quiet-blue" : "button-scan"}
                  disabled={busy}
                  onClick={() => toggleScreen(screen.id)}
                >
                  {assignedSet.has(screen.id) ? "إزالة" : "إضافة"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {playlistId && <Link className="button-scan" href={`/playlists/${playlistId}`}>إدارة محتوى العقد</Link>}

      {contract.status === "confirmed" ? (
        <button className="button-quiet" disabled={busy} onClick={() => setStatus("cancelled", "أُلغي العقد")}>إلغاء العقد</button>
      ) : (
        <button className="button-primary" disabled={busy} onClick={() => setStatus("confirmed", "تأكد العقد وأُرسل إلى الشاشات")}>
          تأكيد العقد
        </button>
      )}

      <KioskSettings
        contractId={contract.id}
        orgId={contract.org_id}
        startsAt={contract.starts_at}
        config={kiosk}
        images={images}
        agenda={agenda}
        guests={guests}
        title={contract.title}
      />

      <section className="assign-section">
        <h2>رابط المستأجر</h2>
        <p className="page-note">يسمح بتعديل النصوص والصور في شاشات هذا العقد خلال فترة الإيجار فقط.</p>
        {inviteUrl && <p className="invite-link" dir="ltr">{inviteUrl}</p>}
        <div className="button-row">
          {inviteUrl ? (
            <button disabled={busy} onClick={copyInvite}>مشاركة الرابط</button>
          ) : (
            <button disabled={busy} onClick={createInvite}>إنشاء رابط</button>
          )}
          <button disabled={busy} onClick={revokeAccess}>إلغاء الوصول</button>
        </div>
      </section>

      {message && <p className="page-note" role="status">{message}</p>}
    </main>
  );
}
