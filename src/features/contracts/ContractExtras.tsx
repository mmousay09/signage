"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";
import { formatDateTime } from "./format";

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
  assistant_ai: boolean;
  assistant_context: string | null;
  /** مفتاح الذكاء الاصطناعي مضاف في إعدادات الموقع */
  ai_ready: boolean;
}

export interface QuestionRow {
  id: string;
  question: string;
  language: Language;
  source: "match" | "ai" | "none";
  answer: string | null;
  created_at: string;
}

const SOURCE_LABEL: Record<QuestionRow["source"], string> = {
  match: "من الأسئلة الجاهزة",
  ai: "أجاب الذكاء الاصطناعي",
  none: "بلا جواب",
};

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
  questions,
}: {
  contractId: string;
  orgId: string;
  config: ExtrasConfig;
  images: { id: string; name: string }[];
  answers: AnswerRow[];
  questions: QuestionRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [assistantOn, setAssistantOn] = useState(config.assistant_enabled);
  const [draftQuestion, setDraftQuestion] = useState<{ text: string; key: number } | null>(null);
  const unanswered = questions.filter((row) => row.source === "none").length;
  // التواريخ تُعرض بتوقيت جهاز المالك
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
        assistant_ai: assistantOn && form.get("assistant_ai") === "on",
        assistant_context: String(form.get("assistant_context") ?? "").trim() || null,
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
    if (!error) {
      formElement.reset();
      setDraftQuestion(null);
    }
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
            زر «اسأل» على الشاشة التفاعلية: يسأل الزائر بصوته أو يكتب سؤاله أو يختار من القائمة، فتجيبه الشاشة وتنطق الجواب.
            يفهم المساعد السؤال حتى لو اختلفت كلماته عن السؤال الجاهز، ويعمل ذلك دون إنترنت.
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
                    <option value="">شخصية مرسومة</option>
                    {images.map((image) => (
                      <option key={image.id} value={image.id}>{image.name}</option>
                    ))}
                  </select>
                </label>
                <label className="check-inline">
                  <input type="checkbox" name="assistant_ai" defaultChecked={config.assistant_ai} />
                  يجيب بالذكاء الاصطناعي عن الأسئلة غير الموجودة في القائمة
                </label>
                {!config.ai_ready && (
                  <p className="page-note">
                    الذكاء الاصطناعي يحتاج مفتاحًا يُضاف مرة واحدة في إعدادات الموقع. حتى ذلك، يجيب المساعد من الأسئلة الجاهزة فقط.
                  </p>
                )}
                <label>
                  معلومات إضافية يعرفها المساعد (اختياري)
                  <textarea
                    name="assistant_context"
                    maxLength={4000}
                    rows={4}
                    defaultValue={config.assistant_context ?? ""}
                    placeholder="مثال: الإنترنت باسم Hall-Guest دون كلمة مرور. المواقف خلف المبنى. الغداء في المطعم بالطابق الأرضي."
                  />
                </label>
                <p className="page-note">يستخدمها الذكاء الاصطناعي مع برنامج الجلسات والأسئلة الجاهزة، ولا يجيب بشيء من خارجها.</p>
              </>
            )}
            <button className="button-quiet-blue" disabled={busy}>حفظ المساعد</button>
          </form>

          {config.assistant_enabled && (
            <>
              <h2>الأسئلة والأجوبة ({answers.length})</h2>
              {answers.length === 0 && !config.assistant_ai && (
                <p className="page-note">يظهر زر المساعد على الشاشة بعد إضافة أول سؤال.</p>
              )}
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
              <form className="form" onSubmit={addAnswer} id="new-answer">
                <h3>سؤال جديد</h3>
                <label>
                  السؤال
                  <input
                    key={draftQuestion?.key ?? 0}
                    name="question"
                    required
                    minLength={2}
                    maxLength={200}
                    placeholder="أين قاعة شحات؟"
                    defaultValue={draftQuestion?.text ?? ""}
                  />
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

              <h2>ماذا سأل الزوار ({questions.length})</h2>
              {questions.length === 0 ? (
                <p className="page-note">تظهر هنا أسئلة الزوار للمساعد، لتعرف ما يهمهم وتضيف جوابًا لما لم يجد له جوابًا.</p>
              ) : (
                <>
                  {unanswered > 0 && (
                    <p className="page-note">{unanswered} {unanswered === 1 ? "سؤال" : "أسئلة"} بلا جواب. أضف لها جوابًا لتعرفها الشاشة في المرة القادمة.</p>
                  )}
                  <ul className="schedule-list">
                    {questions.map((row) => (
                      <li key={row.id}>
                        <strong dir="auto">{row.question}</strong>
                        {row.answer && row.source !== "none" && <p dir="auto">{row.answer}</p>}
                        <span>
                          <span className="question-source" data-source={row.source}>{SOURCE_LABEL[row.source]}</span>
                          {mounted && <> · {formatDateTime(row.created_at)}</>}
                        </span>
                        {row.source !== "match" && (
                          <div className="schedule-actions">
                            <button
                              type="button"
                              onClick={() => {
                                setDraftQuestion({ text: row.question, key: Date.now() });
                                document.getElementById("new-answer")?.scrollIntoView({ behavior: "smooth", block: "start" });
                              }}
                            >
                              أضف جوابًا
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
      )}

      {message && <p className="page-note" role="status">{message}</p>}
    </>
  );
}
