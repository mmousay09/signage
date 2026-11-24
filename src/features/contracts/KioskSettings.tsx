"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";
import { formatDateTime, toLocalInput } from "./format";

type Language = "ar" | "fr" | "en";

export interface KioskConfig {
  interactive: boolean;
  registration_enabled: boolean;
  checkin_enabled: boolean;
  languages: Language[];
  logo_asset_id: string | null;
}

export interface GuestRow {
  id: string;
  badge_code: string;
  full_name: string;
  organization: string | null;
  job_title: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  checked_in_at: string | null;
}

function downloadGuests(rows: GuestRow[], title: string) {
  const header = ["الاسم", "الجهة", "الصفة", "الهاتف", "البريد", "رمز البطاقة", "وقت التسجيل", "الحضور"];
  const quote = (value: string | null) => `"${(value ?? "").replaceAll('"', '""')}"`;
  const lines = rows.map((row) =>
    [
      row.full_name,
      row.organization,
      row.job_title,
      row.phone,
      row.email,
      row.badge_code,
      new Date(row.created_at).toLocaleString("en-GB", { timeZone: "Africa/Tripoli" }),
      row.checked_in_at ? new Date(row.checked_in_at).toLocaleString("en-GB", { timeZone: "Africa/Tripoli" }) : "",
    ]
      .map(quote)
      .join(","),
  );
  // علامة BOM ليفتح Excel الحروف العربية بشكل صحيح
  const blob = new Blob(["\uFEFF" + [header.map(quote).join(","), ...lines].join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `ضيوف - ${title}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
}

export interface AgendaRow {
  id: string;
  title: string;
  speaker: string | null;
  place: string | null;
  starts_at: string;
  ends_at: string | null;
  translations: Partial<Record<Language, { title?: string; speaker?: string; place?: string }>>;
}

const LANGUAGE_NAMES: Record<Language, string> = { ar: "العربية", fr: "الفرنسية", en: "الإنجليزية" };

export function KioskSettings({
  contractId,
  orgId,
  startsAt,
  config,
  images,
  agenda,
  guests,
  title,
}: {
  contractId: string;
  orgId: string;
  startsAt: string;
  config: KioskConfig;
  images: { id: string; name: string }[];
  agenda: AgendaRow[];
  guests: GuestRow[];
  title: string;
}) {
  const router = useRouter();
  const [interactive, setInteractive] = useState(config.interactive);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // التواريخ تُعرض بتوقيت جهاز المالك، فتنتظر حتى تعمل الصفحة في المتصفح
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const attended = guests.filter((guest) => guest.checked_in_at).length;

  async function finish(error: unknown, done: string) {
    if (!error) await createClient().rpc("request_contract_resync", { p_contract: contractId });
    setBusy(false);
    setMessage(error ? "لم يُحفظ التغيير. حاول مرة أخرى." : done);
    if (!error) router.refresh();
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const languages = (["ar", "fr", "en"] as Language[]).filter((language) => form.get(`lang-${language}`) === "on");
    if (interactive && languages.length === 0) {
      setMessage("اختر لغة واحدة على الأقل.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await createClient()
      .from("contracts")
      .update({
        interactive,
        languages: languages.length ? languages : ["ar"],
        registration_enabled: interactive && form.get("registration") === "on",
        checkin_enabled: interactive && form.get("checkin") === "on",
        logo_asset_id: String(form.get("logo") ?? "") || null,
      })
      .eq("id", contractId);
    await finish(error, interactive ? "حُفظت الشاشة التفاعلية وأُرسلت إلى الشاشات" : "عادت شاشات العقد للعرض فقط");
  }

  async function addSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const starts = new Date(value("starts_at"));
    const ends = value("ends_at") ? new Date(value("ends_at")) : null;
    if (ends && ends <= starts) {
      setMessage("يجب أن تنتهي الجلسة بعد بدايتها.");
      return;
    }
    const translations: AgendaRow["translations"] = {};
    for (const language of ["fr", "en"] as const) {
      const entry = Object.fromEntries(
        (["title", "speaker", "place"] as const)
          .map((field) => [field, value(`${language}-${field}`)])
          .filter(([, text]) => text),
      );
      if (Object.keys(entry).length) translations[language] = entry;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await createClient()
      .from("agenda_items")
      .insert({
        org_id: orgId,
        contract_id: contractId,
        title: value("title"),
        speaker: value("speaker") || null,
        place: value("place") || null,
        starts_at: starts.toISOString(),
        ends_at: ends?.toISOString() ?? null,
        translations,
      });
    if (!error) formElement.reset();
    await finish(error, "أُضيفت الجلسة");
  }

  async function markAttended(code: string) {
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().rpc("check_in_guest", { p_contract: contractId, p_code: code });
    setBusy(false);
    setMessage(error ? "لم يُسجَّل الحضور. حاول مرة أخرى." : "سُجّل الحضور");
    if (!error) router.refresh();
  }

  async function removeSession(id: string) {
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().from("agenda_items").delete().eq("id", id);
    await finish(error, "حُذفت الجلسة");
  }

  return (
    <section className="assign-section">
      <h2>الشاشة التفاعلية</h2>
      <p className="page-note">
        تضيف قائمة جانبية يلمسها الزوار: ساعة، شعار، تبديل اللغة، وبرنامج الجلسات. تعود الشاشة وحدها للعرض بعد دقيقة دون لمس.
      </p>

      <form className="form" onSubmit={saveSettings}>
        <fieldset className="check-list">
          <legend>نوع الشاشة</legend>
          <label>
            <input type="radio" name="mode" checked={!interactive} onChange={() => setInteractive(false)} />
            عرض فقط
          </label>
          <label>
            <input type="radio" name="mode" checked={interactive} onChange={() => setInteractive(true)} />
            تفاعلية باللمس
          </label>
        </fieldset>
        {interactive && (
          <>
            <fieldset className="check-list">
              <legend>اللغات (الأولى هي لغة البداية)</legend>
              {(["ar", "fr", "en"] as Language[]).map((language) => (
                <label key={language}>
                  <input type="checkbox" name={`lang-${language}`} defaultChecked={config.languages.includes(language)} />
                  {LANGUAGE_NAMES[language]}
                </label>
              ))}
            </fieldset>
            <fieldset className="check-list">
              <legend>تسجيل الضيوف</legend>
              <label>
                <input type="checkbox" name="registration" defaultChecked={config.registration_enabled} />
                زر «التسجيل» على الشاشة مع بطاقة QR لكل ضيف
              </label>
              <label>
                <input type="checkbox" name="checkin" defaultChecked={config.checkin_enabled} />
                زر «تسجيل الحضور»: يعرض الضيف بطاقته أمام كاميرا الشاشة
              </label>
            </fieldset>
            <label>
              الشعار
              <select name="logo" defaultValue={config.logo_asset_id ?? ""}>
                <option value="">اسم العقد بدل الشعار</option>
                {images.map((image) => (
                  <option key={image.id} value={image.id}>{image.name}</option>
                ))}
              </select>
            </label>
            {images.length === 0 && (
              <p className="page-note">ارفع صورة الشعار من «الوسائط» أو من محتوى العقد لتظهر هنا.</p>
            )}
          </>
        )}
        <button className="button-quiet-blue" disabled={busy}>حفظ نوع الشاشة</button>
      </form>

      {interactive && config.interactive && (
        <>
          <h2>برنامج الجلسات</h2>
          {agenda.length === 0 ? (
            <p className="page-note">لا توجد جلسات بعد. زر «البرنامج» يظهر على الشاشة بعد إضافة أول جلسة.</p>
          ) : (
            <ul className="schedule-list">
              {agenda.map((row) => (
                <li key={row.id}>
                  <strong>{row.title}</strong>
                  {mounted && (
                    <span>
                      {formatDateTime(row.starts_at)}
                      {row.ends_at && <> إلى {formatDateTime(row.ends_at)}</>}
                    </span>
                  )}
                  {(row.speaker || row.place) && <span>{[row.speaker, row.place].filter(Boolean).join("، ")}</span>}
                  {Object.keys(row.translations ?? {}).length > 0 && (
                    <span>مترجمة: {Object.keys(row.translations).map((key) => LANGUAGE_NAMES[key as Language]).join("، ")}</span>
                  )}
                  <div className="schedule-actions">
                    <button type="button" className="danger" disabled={busy} onClick={() => void removeSession(row.id)}>
                      حذف
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form className="form" onSubmit={addSession}>
            <h3>جلسة جديدة</h3>
            <label>
              عنوان الجلسة
              <input name="title" required maxLength={200} />
            </label>
            <label>
              المتحدث (اختياري)
              <input name="speaker" maxLength={120} />
            </label>
            <label>
              المكان (اختياري)
              <input name="place" maxLength={120} placeholder="قاعة شحات" />
            </label>
            <label>
              البداية
              <input
                name="starts_at"
                type="datetime-local"
                dir="ltr"
                required
                defaultValue={mounted ? toLocalInput(startsAt) : undefined}
                key={mounted ? "local" : "server"}
              />
            </label>
            <label>
              النهاية (اختياري)
              <input name="ends_at" type="datetime-local" dir="ltr" />
            </label>
            {config.languages.filter((language) => language !== "ar").map((language) => (
              <details key={language} className="translation">
                <summary>الترجمة {LANGUAGE_NAMES[language]}</summary>
                <label>
                  العنوان
                  <input name={`${language}-title`} dir="ltr" maxLength={200} />
                </label>
                <label>
                  المتحدث
                  <input name={`${language}-speaker`} dir="ltr" maxLength={120} />
                </label>
                <label>
                  المكان
                  <input name={`${language}-place`} dir="ltr" maxLength={120} />
                </label>
              </details>
            ))}
            <button className="button-primary" disabled={busy}>إضافة الجلسة</button>
          </form>
        </>
      )}

      {(config.registration_enabled || config.checkin_enabled || guests.length > 0) && (
        <>
          <h2>الضيوف المسجلون ({guests.length})</h2>
          {guests.length > 0 && (
            <p className="page-note">
              حضر {attended} من {guests.length}.{" "}
              <Link href={`/contracts/${contractId}/checkin`} className="button-quiet-blue">
                تسجيل الحضور من هاتفك
              </Link>
            </p>
          )}
          {guests.length === 0 ? (
            <p className="page-note">لم يسجل أحد بعد. تظهر هنا تسجيلات الشاشة فور وصولها.</p>
          ) : (
            <>
              <button type="button" className="button-quiet-blue" onClick={() => downloadGuests(guests, title)}>
                تنزيل القائمة لـ Excel
              </button>
              <ul className="schedule-list">
                {guests.map((guest) => (
                  <li key={guest.id}>
                    <strong>{guest.full_name}</strong>
                    {(guest.job_title || guest.organization) && (
                      <span>{[guest.job_title, guest.organization].filter(Boolean).join("، ")}</span>
                    )}
                    {(guest.phone || guest.email) && (
                      <span dir="ltr" className="guest-contact">{[guest.phone, guest.email].filter(Boolean).join(" · ")}</span>
                    )}
                    <span>
                      <a href={`/b/${guest.badge_code}`} target="_blank" rel="noreferrer" dir="ltr">
                        {guest.badge_code}
                      </a>
                      {mounted && <> · {formatDateTime(guest.created_at)}</>}
                    </span>
                    <div className="schedule-actions">
                      {guest.checked_in_at ? (
                        <span className="guest-attended">حضر{mounted && <> {formatDateTime(guest.checked_in_at)}</>}</span>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => void markAttended(guest.badge_code)}>
                          تسجيل حضوره
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {message && <p className="page-note" role="status">{message}</p>}
    </section>
  );
}
