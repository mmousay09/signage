import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/features/contracts/PrintButton";
import { getAdminContext } from "@/lib/admin";

interface Report {
  title: string;
  starts_at: string;
  ends_at: string;
  client: string | null;
  organization: string;
  contact_phone: string | null;
  screens: { name: string; location: string | null; plays: number; shown_ms: number; active_hours: number }[];
  items: { label: string; plays: number; shown_ms: number }[];
  days: { day: string; plays: number; shown_ms: number }[];
  qr_scans: number;
  guests: number;
  checked_in: number;
  generated_at: string;
}

const number = new Intl.NumberFormat("ar-LY-u-nu-latn");
const dateTime = new Intl.DateTimeFormat("ar-LY-u-nu-latn", {
  timeZone: "Africa/Tripoli",
  dateStyle: "long",
  timeStyle: "short",
});
const day = new Intl.DateTimeFormat("ar-LY-u-nu-latn", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

function duration(ms: number) {
  if (ms < 60_000) return `${number.format(Math.round(ms / 1000))} ثانية`;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${number.format(minutes)} دقيقة`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${number.format(hours)} ساعة${rest ? ` و${number.format(rest)} دقيقة` : ""}`;
}

export default async function ContractReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getAdminContext();
  const { data, error } = await supabase.rpc("contract_report", { p_contract: id });
  if (error || !data) notFound();
  const report = data as Report;
  const totalPlays = report.items.reduce((sum, item) => sum + Number(item.plays), 0);
  const totalMs = report.items.reduce((sum, item) => sum + Number(item.shown_ms), 0);

  return (
    <main className="page report">
      <div className="report-tools">
        <Link href={`/contracts/${id}`}>رجوع إلى العقد</Link>
        <PrintButton />
      </div>

      <header className="report-head">
        <small>{report.organization}</small>
        <h1>تقرير إثبات العرض</h1>
        <p>
          <strong>{report.title}</strong>
          {report.client && <> لصالح {report.client}</>}
        </p>
        <p>
          من {dateTime.format(new Date(report.starts_at))} إلى {dateTime.format(new Date(report.ends_at))}
        </p>
      </header>

      <dl className="report-totals">
        <div>
          <dt>مرات العرض</dt>
          <dd>{number.format(totalPlays)}</dd>
        </div>
        <div>
          <dt>مدة العرض</dt>
          <dd>{duration(totalMs)}</dd>
        </div>
        <div>
          <dt>الشاشات</dt>
          <dd>{number.format(report.screens.length)}</dd>
        </div>
        {report.qr_scans > 0 && (
          <div>
            <dt>مسح رمز QR</dt>
            <dd>{number.format(report.qr_scans)}</dd>
          </div>
        )}
        {report.guests > 0 && (
          <div>
            <dt>الضيوف المسجلون</dt>
            <dd>
              {number.format(report.guests)}
              {report.checked_in > 0 && <small> (حضر {number.format(report.checked_in)})</small>}
            </dd>
          </div>
        )}
      </dl>

      <section>
        <h2>حسب الشاشة</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">الشاشة</th>
              <th scope="col">مرات العرض</th>
              <th scope="col">مدة العرض</th>
              <th scope="col">ساعات التشغيل</th>
            </tr>
          </thead>
          <tbody>
            {report.screens.map((screen) => (
              <tr key={screen.name + screen.location}>
                <th scope="row">
                  {screen.name}
                  {screen.location && <small> · {screen.location}</small>}
                </th>
                <td>{number.format(screen.plays)}</td>
                <td>{duration(screen.shown_ms)}</td>
                <td>{number.format(screen.active_hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {report.items.length > 0 && (
        <section>
          <h2>حسب المادة المعروضة</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">المادة</th>
                <th scope="col">مرات العرض</th>
                <th scope="col">مدة العرض</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((item) => (
                <tr key={item.label}>
                  <th scope="row">{item.label}</th>
                  <td>{number.format(item.plays)}</td>
                  <td>{duration(item.shown_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report.days.length > 0 && (
        <section>
          <h2>حسب اليوم</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">اليوم</th>
                <th scope="col">مرات العرض</th>
                <th scope="col">مدة العرض</th>
              </tr>
            </thead>
            <tbody>
              {report.days.map((row) => (
                <tr key={row.day}>
                  <th scope="row">{day.format(new Date(`${row.day}T00:00:00Z`))}</th>
                  <td>{number.format(row.plays)}</td>
                  <td>{duration(row.shown_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {totalPlays === 0 && <p className="page-note">لا توجد مرات عرض مسجلة بعد لهذا العقد.</p>}

      <footer className="report-foot">
        <p>
          تسجل كل شاشة ما تعرضه فعليًا، وترسله عند الاتصال بالإنترنت. أُعدّ التقرير في{" "}
          {dateTime.format(new Date(report.generated_at))}.
        </p>
        {report.contact_phone && <p>للاستفسار: <bdi dir="ltr">{report.contact_phone}</bdi></p>}
      </footer>
    </main>
  );
}
