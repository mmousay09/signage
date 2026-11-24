"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export interface RemoteSettings {
  rotation: 0 | 90 | 180 | 270;
  volume: number;
  alert_offline: boolean;
}

interface Snapshot {
  image: string;
  taken_at: string;
}

const ROTATIONS: { value: RemoteSettings["rotation"]; label: string }[] = [
  { value: 0, label: "كما هي" },
  { value: 90, label: "تدوير ربع لفة يمينًا" },
  { value: 270, label: "تدوير ربع لفة يسارًا" },
  { value: 180, label: "قلب رأسًا على عقب" },
];

const timeFormat = new Intl.DateTimeFormat("ar-LY-u-nu-latn", { timeZone: "Africa/Tripoli", timeStyle: "short", dateStyle: "short" });

export function RemoteControl({
  screenId,
  orgId,
  online,
  nowPlaying,
  settings,
  snapshot: initialSnapshot,
}: {
  screenId: string;
  orgId: string;
  online: boolean;
  nowPlaying: { kind: string; label: string } | null;
  settings: RemoteSettings;
  snapshot: Snapshot | null;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [waiting, setWaiting] = useState(false);
  const [volume, setVolume] = useState(settings.volume);
  const [message, setMessage] = useState<string | null>(null);
  const volumeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(volumeTimer.current), []);

  async function save(values: Partial<RemoteSettings>, done: string) {
    const supabase = createClient();
    const { error } = await supabase.from("screens").update(values).eq("id", screenId);
    if (!error && ("rotation" in values || "volume" in values)) {
      await supabase.from("screen_commands").insert({ org_id: orgId, screen_id: screenId, command: "resync" });
    }
    setMessage(error ? "لم يُحفظ التغيير. تأكد من الاتصال." : done);
    if (!error) router.refresh();
  }

  function changeVolume(value: number) {
    setVolume(value);
    clearTimeout(volumeTimer.current);
    // يُرسل بعد توقف الإصبع عن التحريك
    volumeTimer.current = setTimeout(() => void save({ volume: value }, `ضُبط الصوت على ${value}٪`), 600);
  }

  async function takeSnapshot() {
    setWaiting(true);
    setMessage(null);
    const supabase = createClient();
    const asked = Date.now();
    const { error } = await supabase
      .from("screen_commands")
      .insert({ org_id: orgId, screen_id: screenId, command: "snapshot" });
    if (error) {
      setWaiting(false);
      setMessage("لم يُرسل الطلب. تأكد من الاتصال.");
      return;
    }
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const { data } = await supabase
        .from("screen_snapshots")
        .select("image, taken_at")
        .eq("screen_id", screenId)
        .maybeSingle();
      if (data && Date.parse(data.taken_at as string) >= asked - 5_000) {
        setSnapshot(data as Snapshot);
        setWaiting(false);
        return;
      }
    }
    setWaiting(false);
    setMessage(online ? "لم تصل اللقطة بعد. حاول مرة أخرى." : "الشاشة غير متصلة، وستُلتقط الصورة عند عودتها.");
  }

  return (
    <section className="assign-section remote">
      <h2>التحكم عن بعد</h2>

      <div className="remote-now">
        <span>يعرض الآن</span>
        <strong>{nowPlaying?.label ?? (online ? "لا شيء محدد" : "غير متصلة")}</strong>
      </div>

      <figure className="remote-snapshot">
        {snapshot ? (
          // اللقطة صورة صغيرة محفوظة كنص
          // eslint-disable-next-line @next/next/no-img-element
          <img src={snapshot.image} alt="لقطة مما تعرضه الشاشة" />
        ) : (
          <div className="remote-empty">لا توجد لقطة بعد</div>
        )}
        {snapshot && <figcaption>التُقطت {timeFormat.format(new Date(snapshot.taken_at))}</figcaption>}
      </figure>
      <button type="button" className="button-scan" disabled={waiting} onClick={() => void takeSnapshot()}>
        {waiting ? "جارٍ التقاط الصورة" : "التقط صورة مما تعرضه الآن"}
      </button>

      <label className="remote-volume">
        <span>
          الصوت <output>{volume}٪</output>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={volume}
          onChange={(event) => changeVolume(Number(event.target.value))}
        />
      </label>

      <label className="remote-field">
        اتجاه العرض
        <select
          defaultValue={settings.rotation}
          onChange={(event) =>
            void save({ rotation: Number(event.target.value) as RemoteSettings["rotation"] }, "أُرسل الاتجاه إلى الشاشة")
          }
        >
          {ROTATIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <p className="page-note">استخدمه إذا رُكّبت الشاشة بالعرض والمحتوى بالطول، أو العكس.</p>

      <label className="check-inline">
        <input
          type="checkbox"
          defaultChecked={settings.alert_offline}
          onChange={(event) =>
            void save(
              { alert_offline: event.target.checked },
              event.target.checked ? "ستصلك تنبيهات إذا انقطعت هذه الشاشة" : "أُوقفت تنبيهات هذه الشاشة",
            )
          }
        />
        نبّهني إذا انقطعت هذه الشاشة، حتى لو لم تكن مؤجرة
      </label>

      {message && <p className="page-note" role="status">{message}</p>}
    </section>
  );
}
