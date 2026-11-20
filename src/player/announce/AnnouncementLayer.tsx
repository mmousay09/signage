"use client";

import { useEffect, useRef, useState } from "react";
import { playChime } from "@/player/audio/audio";
import { speak } from "@/player/audio/speech";
import { checkSchedules, LATE_LIMIT_MS, onAnnouncement, type Announcement } from "@/player/announce/engine";
import type { ManifestSchedule } from "@/player/offline/store";

const MIN_VISIBLE_MS = 6_000;
const CHIME_MS = 1_900;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

export function AnnouncementLayer({
  schedules,
  clockOffset,
}: {
  schedules: ManifestSchedule[] | undefined;
  clockOffset: number;
}) {
  const [current, setCurrent] = useState<Announcement | null>(null);
  const offsetRef = useRef(clockOffset);
  const schedulesRef = useRef(schedules);
  offsetRef.current = clockOffset;
  schedulesRef.current = schedules;

  useEffect(() => {
    const queue: Announcement[] = [];
    let running = false;
    let stopped = false;
    const serverNow = () => Date.now() + offsetRef.current;

    const run = async () => {
      if (running) return;
      running = true;
      while (!stopped && queue.length) {
        queue.sort((a, b) => a.at - b.at);
        const item = queue.shift()!;
        await wait(item.at - serverNow());
        const drift = Math.round(serverNow() - item.at);
        if (drift > LATE_LIMIT_MS) {
          item.report?.("missed", null, "late");
          continue;
        }
        setCurrent(item);
        const shownAt = Date.now();
        const chime = await playChime();
        await wait(CHIME_MS);
        const spoken = chime === "blocked" ? "audio_blocked" : await speak(item.body);
        await wait(MIN_VISIBLE_MS - (Date.now() - shownAt));
        item.report?.("played", drift, spoken === "spoken" ? undefined : spoken);
        setCurrent(null);
        await wait(400);
      }
      running = false;
    };

    const off = onAnnouncement((item) => {
      queue.push(item);
      void run();
    });
    const timer = setInterval(() => checkSchedules(schedulesRef.current, serverNow()), 250);
    return () => {
      stopped = true;
      off();
      clearInterval(timer);
    };
  }, []);

  if (!current) return null;
  return (
    <section className="announce" aria-live="assertive">
      <small>{current.title}</small>
      <p>{current.body}</p>
    </section>
  );
}
