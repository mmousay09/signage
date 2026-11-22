"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { whatsappLink } from "@/lib/whatsapp";
import { formatDateTime } from "./format";

export interface ExpiringRow {
  id: string;
  title: string;
  ends_at: string;
  client_name: string | null;
  client_phone: string | null;
}

const EXTENSIONS = [
  { days: 1, label: "يوم" },
  { days: 7, label: "أسبوع" },
  { days: 30, label: "شهر" },
];

export function ExpiringContracts({ rows, organization }: { rows: ExpiringRow[]; organization: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!rows.length) return null;

  async function extend(row: ExpiringRow, days: number) {
    setBusy(row.id);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("contracts")
      .update({ ends_at: new Date(Date.parse(row.ends_at) + days * 86_400_000).toISOString() })
      .eq("id", row.id);
    if (!error) await supabase.rpc("request_contract_resync", { p_contract: row.id });
    setBusy(null);
    setMessage(
      error
        ? error.code === "23P01"
          ? `لم يُمدَّد «${row.title}»: الشاشة محجوزة لعقد آخر في هذه الفترة.`
          : "لم يُحفظ التمديد. حاول مرة أخرى."
        : `مُدّد «${row.title}».`,
    );
    if (!error) router.refresh();
  }

  return (
    <section className="expiring">
      <h2>عقود تنتهي خلال 3 أيام</h2>
      <ul>
        {rows.map((row) => {
          const offer = whatsappLink(
            row.client_phone,
            `مرحبًا${row.client_name ? ` ${row.client_name}` : ""}، عقد «${row.title}» لدى ${organization} ينتهي قريبًا. هل ترغب في تجديده؟ يسعدنا ترتيب التمديد لكم.`,
          );
          return (
            <li key={row.id}>
              <Link href={`/contracts/${row.id}`}>
                <strong>{row.title}</strong>
              </Link>
              <span>
                {row.client_name ?? "بدون عميل"}
                {mounted && <> · ينتهي {formatDateTime(row.ends_at)}</>}
              </span>
              <div className="expiring-actions">
                {EXTENSIONS.map((option) => (
                  <button key={option.days} type="button" disabled={busy !== null} onClick={() => void extend(row, option.days)}>
                    مدّد {option.label}
                  </button>
                ))}
                {offer && (
                  <a className="whatsapp" href={offer} target="_blank" rel="noreferrer">
                    عرض التجديد على واتساب
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {message && <p className="page-note" role="status">{message}</p>}
    </section>
  );
}
