"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";

type Language = "ar" | "fr" | "en";

export interface ExtrasConfig {
  qr_url: string | null;
  qr_caption: string | null;
  qr_scans: number;
  interactive: boolean;
  languages: Language[];
  assistant_enabled: boolean;
  assistant_name: string | null;
  assistant_asset_id: string | null;
}

export interface AnswerRow {
  id: string;
  question: string;
  answer: string;
  translations: Partial<Record<Language, { question?: string; answer?: string }>>;
}

const LANGUAGE_NAMES: Record<Language, string> = { ar: "العربية", fr: "الفرنسية", en: "الإنجليزية" };

export function ContractExtras({
  contractId,
  orgId,
  config,
  images,
  answers,
}: {
  contractId: string;
  orgId: string;
  config: ExtrasConfig;
  images: { id: string; name: string }[];
  answers: AnswerRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [assistantOn, setAssistantOn] = useState(config.assistant_enabled);

  async function finish(error: { message: string } | null, done: string) {
    if (!error) await createClient().rpc("request_contract_resync", { p_contract: contractId });
    setBusy(false);
    setMessage(error ? "لم يُحفظ التغيير. تأكد من البيانات وحاول مرة أخرى." : done);
    if (!error) router.refresh();
  }

  async function saveQr(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let url = String(form.get("qr_url") ?? "").trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    setBusy(true);
    setMessage(null);
    const { error } = await createClient()
      .from("contracts")
      .update({ qr_url: url || null, qr_caption: String(form.get("qr_caption") ?? "").trim() || null })
      .eq("id", contractId);
    await finish(error, url ? "حُفظ رمز QR وأُرسل إلى الشاشات" : "أُزيل رمز QR من الشاشات");
  }

  async function saveAssistant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);
    const { error } = await createClient()
      .from("contracts")
      .update({
        assistant_enabled: assistantOn,
        assistant_name: String(form.get("assistant_name") ?? "").trim() || null,
        assistant_asset_id: String(form.get("assistant_avatar") ?? "") || null,
      })
      .eq("id", contractId);
    await finish(error, assistantOn ? "حُفظ المساعد" : "أُخفي المساعد من الشاشة");
  }

  async function addAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const translations: AnswerRow["translations"] = {};
    for (const language of ["fr", "en"] as const) {
      const entry = Object.fromEntries(
        (["question", "answer"] as const).map((field) => [field, value(`${language}-${field}`)]).filter(([, text]) => text),
      );
      if (Object.keys(entry).length) translations[language] = entry;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await createClient()
      .from("assistant_answers")
      .insert({
        org_id: orgId,
        contract_id: contractId,
        position: answers.length,
        question: value("question"),
        answer: value("answer"),
        translations,
      });
    if (!error) formElement.reset();
    await finish(error, "أُضيف السؤال");
  }

  async function removeAnswer(id: string) {
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().from("assistant_answers").delete().eq("id", id);
    await finish(error, "حُذف السؤال");
  }

  return (
    <>
      <section className="assign-section">
        <h2>تقرير إثبات العرض</h2>
        <p className="page-note">عدد مرات ومدة عرض كل مادة على كل شاشة، جاهز للطباعة أو الحفظ PDF وإرساله للعميل.</p>
        <Link className="button-scan" href={`/contracts/${contractId}/report`}>
          فتح التقرير
        </Link>
      </section>

      <section className="assign-section">
        <h2>رمز QR على الشاشة</h2>
        <p className="page-note">
          يظهر في زاوية الشاشة ويفتح الرابط الذي تختاره، ويُحسب كل مسح لكل شاشة.
          {config.qr_url && <> مُسح حتى الآن {config.qr_scans} {config.qr_scans === 1 ? "مرة" : "مرات"}.</>}
        </p>
        <form className="form" onSubmit={saveQr}>
          <label>
            الرابط
            <input name="qr_url" type="url" dir="ltr" inputMode="url" defaultValue={config.qr_url ?? ""} placeholder="https://" />
          </label>
          <label>
            النص تحت الرمز
            <input name="qr_caption" maxLength={60} defaultValue={config.qr_caption ?? ""} placeholder="امسح للمزيد" />
          </label>
          <button className="button-quiet-blue" disabled={busy}>حفظ رمز QR</button>
        </form>
      </section>

      {config.interactive && (
        <section className="assign-section">
          <h2>المساعد</h2>
          <p className="page-note">
            زر «اسأل» على الشاشة التفاعلية: يختار الزائر سؤالًا فيظهر الجواب وتنطقه الشاشة. الإجابة بالذكاء الاصطناعي على أي سؤال تحتاج اشتراكًا مدفوعًا، وتُضاف لاحقًا.
          </p>
          <form className="form" onSubmit={saveAssistant}>
            <label className="check-inline">
              <input type="checkbox" checked={assistantOn} onChange={(event) => setAssistantOn(event.target.checked)} />
              إظهار المساعد على الشاشة
            </label>
            {assistantOn && (
              <>
                <label>
                  اسم المساعد
                  <input name="assistant_name" maxLength={40} defaultValue={config.assistant_name ?? ""} placeholder="مايا" />
                </label>
                <label>
                  صورة المساعد
                  <select name="assistant_avatar" defaultValue={config.assistant_asset_id ?? ""}>
                    <option value="">الحرف الأول من الاسم</option>
                    {images.map((image) => (
                      <option key={image.id} value={image.id}>{image.name}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <button className="button-quiet-blue" disabled={busy}>حفظ المساعد</button>
          </form>

          {config.assistant_enabled && (
            <>
              <h2>الأسئلة والأجوبة ({answers.length})</h2>
              {answers.length === 0 && <p className="page-note">يظهر زر المساعد على الشاشة بعد إضافة أول سؤال.</p>}
              <ul className="schedule-list">
                {answers.map((row) => (
                  <li key={row.id}>
                    <strong>{row.question}</strong>
                    <p>{row.answer}</p>
                    {Object.keys(row.translations ?? {}).length > 0 && (
                      <span>مترجم: {Object.keys(row.translations).map((key) => LANGUAGE_NAMES[key as Language]).join("، ")}</span>
                    )}
                    <div className="schedule-actions">
                      <button type="button" className="danger" disabled={busy} onClick={() => void removeAnswer(row.id)}>
                        حذف
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <form className="form" onSubmit={addAnswer}>
                <h3>سؤال جديد</h3>
                <label>
                  السؤال
                  <input name="question" required minLength={2} maxLength={200} placeholder="أين قاعة شحات؟" />
                </label>
                <label>
                  الجواب
                  <textarea name="answer" required maxLength={1500} rows={3} />
                </label>
                {config.languages.filter((language) => language !== "ar").map((language) => (
                  <details key={language} className="translation">
                    <summary>الترجمة {LANGUAGE_NAMES[language]}</summary>
                    <label>
                      السؤال
                      <input name={`${language}-question`} dir="ltr" maxLength={200} />
                    </label>
                    <label>
                      الجواب
                      <textarea name={`${language}-answer`} dir="ltr" maxLength={1500} rows={3} />
                    </label>
                  </details>
                ))}
                <button className="button-primary" disabled={busy}>إضافة السؤال</button>
              </form>
            </>
          )}
        </section>
      )}

      {message && <p className="page-note" role="status">{message}</p>}
    </>
  );
}
