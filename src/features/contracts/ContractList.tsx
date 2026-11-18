"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";
import { contractState, formatDateTime, type ContractStatus } from "./format";

export interface ContractSummary {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: ContractStatus;
  client_name: string;
}

export function ContractList({
  orgId,
  contracts,
  clients,
}: {
  orgId: string;
  contracts: ContractSummary[];
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setNow(Date.now()), []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const clientName = String(form.get("client")).trim();
    const phone = String(form.get("phone")).trim();
    const startsAt = new Date(String(form.get("starts_at")));
    const endsAt = new Date(String(form.get("ends_at")));
    if (endsAt <= startsAt) {
      setError("يجب أن تكون نهاية الإيجار بعد بدايته.");
      return;
    }

    setBusy(true);
    setError(null);
    const supabase = createClient();
    let clientId = clients.find((client) => client.name === clientName)?.id;
    if (!clientId) {
      const { data, error: clientError } = await supabase
        .from("clients")
        .insert({ org_id: orgId, name: clientName, phone: phone || null })
        .select("id")
        .single();
      if (clientError || !data) {
        setError("تعذر حفظ العميل. حاول مرة أخرى.");
        setBusy(false);
        return;
      }
      clientId = data.id as string;
    }

    const { data, error: contractError } = await supabase
      .from("contracts")
      .insert({
        org_id: orgId,
        client_id: clientId,
        title: String(form.get("title")).trim(),
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .select("id")
      .single();
    if (contractError || !data) {
      setError("تعذر إنشاء العقد. حاول مرة أخرى.");
      setBusy(false);
      return;
    }
    router.push(`/contracts/${data.id}`);
  }

  return (
    <main className="page">
      <h1>العقود</h1>
      <form className="form" onSubmit={create}>
        <label>
          العميل
          <input name="client" list="client-names" required maxLength={120} placeholder="شركة النور" />
          <datalist id="client-names">
            {clients.map((client) => <option key={client.id} value={client.name} />)}
          </datalist>
        </label>
        <label>
          هاتف العميل (اختياري)
          <input name="phone" type="tel" dir="ltr" maxLength={30} />
        </label>
        <label>
          اسم الفعالية أو العقد
          <input name="title" required maxLength={120} placeholder="معرض طرابلس" />
        </label>
        <label>
          بداية الإيجار
          <input name="starts_at" type="datetime-local" dir="ltr" required />
        </label>
        <label>
          نهاية الإيجار
          <input name="ends_at" type="datetime-local" dir="ltr" required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button-primary" disabled={busy}>{busy ? "جارٍ الحفظ" : "إنشاء العقد"}</button>
      </form>

      {contracts.length === 0 ? (
        <p className="board-empty">لا توجد عقود بعد.</p>
      ) : (
        <ul className="contract-list">
          {contracts.map((contract) => {
            const state = now === null ? null : contractState(contract.status, contract.starts_at, contract.ends_at, now);
            return (
              <li key={contract.id}>
                <Link href={`/contracts/${contract.id}`}>
                  <strong>{contract.title}</strong>
                  <span>{contract.client_name}</span>
                  {now !== null && <span>{formatDateTime(contract.starts_at)} إلى {formatDateTime(contract.ends_at)}</span>}
                  {state && <span className="status-pill" data-state={state.key}>{state.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
