"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";
import { getPlayerClient } from "@/lib/supabase/player";
import { emitAnnouncement, wasAnnounced } from "@/player/announce/engine";
import { getAudioState, playChime, type AudioState } from "@/player/audio/audio";
import {
  clearStoredContent,
  getStorageStats,
  installManifest,
  loadActiveManifest,
  type PlayerManifest,
} from "@/player/offline/store";

const APP_VERSION = "0.4.0";
const CLOCK_KEY = "signage-clock-offset";
const PAIRING_INTERVAL = 3_000;
const HEARTBEAT_INTERVAL = 30_000;
const RETRY_INTERVAL = 5_000;
const IDENTIFY_DURATION = 12_000;

export type PlayerPhase = "starting" | "pairing" | "ready" | "disabled" | "setup-error";

export interface ScreenConnection {
  phase: PlayerPhase;
  code: string | null;
  screenId: string | null;
  screenName: string | null;
  location: string | null;
  isConnected: boolean;
  isIdentifying: boolean;
  audio: AudioState;
  setAudio: (state: AudioState) => void;
  manifest: PlayerManifest | null;
  clockOffset: number;
}

interface PairingResult {
  screen_id: string;
  paired: boolean;
  code?: string;
}

export function useScreenConnection(): ScreenConnection {
  const [phase, setPhase] = useState<PlayerPhase>("starting");
  const [code, setCode] = useState<string | null>(null);
  const [screenId, setScreenId] = useState<string | null>(null);
  const [screenName, setScreenName] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [audio, setAudio] = useState<AudioState>("unknown");
  const [manifest, setManifest] = useState<PlayerManifest | null>(null);
  const [clockOffset, setClockOffset] = useState(0);

  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) {
      setPhase("setup-error");
      return;
    }

    const supabase = getPlayerClient();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let identifyTimer: ReturnType<typeof setTimeout> | undefined;
    let channel: RealtimeChannel | null = null;
    let channelScreen: string | null = null;
    let ticking = false;
    let processing = false;
    let processAgain = false;
    let wakeLock: WakeLockSentinel | null = null;
    let activeVersion: string | null = null;
    let syncing = false;
    let contentState: Record<string, unknown> = { status: "idle" };

    // آخر فرق معروف عن ساعة الخادم يبقى صالحًا عند انقطاع الإنترنت
    const storedOffset = Number(window.localStorage.getItem(CLOCK_KEY));
    if (Number.isFinite(storedOffset)) setClockOffset(storedOffset);

    void loadActiveManifest()
      .then((stored) => {
        if (!stored || stopped || activeVersion) return;
        activeVersion = stored.version;
        setManifest(stored);
      })
      .catch(() => undefined);

    const syncContent = async () => {
      if (syncing) return;
      syncing = true;
      try {
        const { data, error } = await supabase.rpc("get_player_manifest");
        if (error) throw error;
        const remote = data as PlayerManifest | { version: null };
        if (!remote.version || remote.version === activeVersion) {
          contentState = { status: "ready", version: activeVersion };
          return;
        }
        const next = remote as PlayerManifest;
        await installManifest(supabase, next, (ready, total) => {
          contentState = { status: "downloading", version: next.version, ready, total };
        });
        activeVersion = next.version;
        contentState = { status: "ready", version: next.version };
        if (!stopped) setManifest(next);
      } catch (error) {
        contentState = {
          status: "error",
          version: activeVersion,
          error: error instanceof Error ? error.message.slice(0, 120) : "sync_failed",
        };
      } finally {
        syncing = false;
      }
    };

    const requestWakeLock = async () => {
      try {
        if (document.visibilityState === "visible" && !wakeLock) {
          wakeLock = await navigator.wakeLock.request("screen");
          wakeLock.addEventListener("release", () => {
            wakeLock = null;
          });
        }
      } catch {
        wakeLock = null;
      }
    };

    const identify = async () => {
      setIsIdentifying(true);
      clearTimeout(identifyTimer);
      identifyTimer = setTimeout(() => setIsIdentifying(false), IDENTIFY_DURATION);
      setAudio(await playChime());
    };

    const processCommands = async () => {
      if (processing) {
        processAgain = true;
        return;
      }
      processing = true;
      let shouldReload = false;
      try {
        do {
          processAgain = false;
          const { data, error } = await supabase
            .from("screen_commands")
            .select("id, command")
            .eq("status", "pending")
            .gt("expires_at", new Date().toISOString())
            .order("created_at");
          if (error || !data) break;

          for (const item of data as { id: string; command: string }[]) {
            let ok = true;
            try {
              if (item.command === "reload") shouldReload = true;
              if (item.command === "identify") await identify();
              if (item.command === "resync") void syncContent();
              if (item.command === "clear_cache") {
                await clearStoredContent();
                activeVersion = null;
                setManifest(null);
                void syncContent();
              }
            } catch {
              ok = false;
            }
            // التأكيد قبل إعادة التحميل يمنع تكرار الأمر بلا نهاية
            const { error: ackError } = await supabase.rpc("ack_screen_command", {
              p_command: item.id,
              p_ok: ok,
            });
            if (ackError && item.command === "reload") shouldReload = false;
          }
        } while (processAgain && !stopped);
      } finally {
        processing = false;
      }
      if (shouldReload && !stopped) window.location.reload();
    };

    interface BroadcastMessage {
      id: string;
      body: string;
      play_at: string;
    }

    // النداء العاجل: يُبلَّغ الخادم بوصوله، ثم يُعرض في اللحظة الموحدة
    const receiveBroadcast = (message: BroadcastMessage) => {
      if (!message?.id || !message.play_at || wasAnnounced(`broadcast:${message.id}`)) return;
      // طلبات Supabase لا تُرسل إلا عند انتظار نتيجتها
      void supabase
        .rpc("report_broadcast_status", { p_broadcast: message.id, p_status: "received" })
        .then(() => undefined);
      emitAnnouncement({
        key: `broadcast:${message.id}`,
        title: "نداء عاجل",
        body: message.body,
        at: Date.parse(message.play_at),
        report: (status, driftMs, error) =>
          void supabase
            .rpc("report_broadcast_status", {
              p_broadcast: message.id,
              p_status: status,
              p_drift_ms: driftMs,
              p_error: error ?? null,
            })
            .then(() => undefined),
      });
    };

    const fetchPendingBroadcasts = async () => {
      const { data } = await supabase.rpc("pending_broadcasts");
      for (const message of (data ?? []) as BroadcastMessage[]) receiveBroadcast(message);
    };

    const connectChannel = async (screenId: string) => {
      if (channel && channelScreen === screenId && (channel.state as string) === "joined") return;
      if (channel) await supabase.removeChannel(channel);
      await supabase.realtime.setAuth();
      channelScreen = screenId;
      channel = supabase
        .channel(`screen:${screenId}`, { config: { private: true } })
        .on("broadcast", { event: "command" }, () => void processCommands())
        .on("broadcast", { event: "broadcast" }, ({ payload }) => receiveBroadcast(payload as BroadcastMessage))
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void processCommands();
            void fetchPendingBroadcasts();
          }
        });
    };

    const ensureSession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      // انقطاع الإنترنت يجب ألا يصنع هوية جديدة للشاشة
      if (sessionError) throw sessionError;
      if (data.session) return true;
      const { error } = await supabase.auth.signInAnonymously();
      if (!error) return true;
      if (error.code === "anonymous_provider_disabled") setPhase("setup-error");
      throw error;
    };

    const tick = async (): Promise<number> => {
      await ensureSession();

      const pairing = await supabase.rpc("request_pairing_code");
      if (pairing.error) {
        if (pairing.error.message.includes("auth_required")) {
          await supabase.auth.signOut({ scope: "local" });
        }
        throw pairing.error;
      }
      const result = pairing.data as PairingResult;
      setIsConnected(true);

      if (!result.paired) {
        setCode(result.code ?? null);
        setPhase("pairing");
        return PAIRING_INTERVAL;
      }

      const currentAudio = getAudioState();
      setAudio(currentAudio);
      const storage = await getStorageStats();
      const heartbeat = await supabase.rpc("screen_heartbeat", {
        p_app_version: APP_VERSION,
        p_cached_bytes: storage.used,
        p_free_bytes: storage.free,
        p_state: {
          content: contentState,
          audio: currentAudio,
          wake_lock: Boolean(wakeLock),
          display: `${window.screen.width}x${window.screen.height}`,
          fullscreen:
            window.matchMedia("(display-mode: fullscreen)").matches ||
            Boolean(document.fullscreenElement),
        },
      });
      if (heartbeat.error) throw heartbeat.error;

      const serverTime = (heartbeat.data as { server_time_ms?: number }).server_time_ms;
      if (typeof serverTime === "number") {
        const offset = serverTime - Date.now();
        window.localStorage.setItem(CLOCK_KEY, String(offset));
        setClockOffset(offset);
      }

      if (!(heartbeat.data as { paired: boolean }).paired) {
        setPhase("disabled");
        return HEARTBEAT_INTERVAL;
      }

      const { data: screen } = await supabase
        .from("screens")
        .select("name, location")
        .eq("id", result.screen_id)
        .maybeSingle();
      setScreenId(result.screen_id);
      setScreenName((screen?.name as string | null) ?? null);
      setLocation((screen?.location as string | null) ?? null);
      setCode(null);
      setPhase("ready");
      void requestWakeLock();
      await connectChannel(result.screen_id);
      await processCommands();
      // احتياط إن ضاعت رسالة النداء أثناء انقطاع قصير
      void fetchPendingBroadcasts();
      void syncContent();
      return HEARTBEAT_INTERVAL;
    };

    const run = async () => {
      if (stopped || ticking) return;
      ticking = true;
      clearTimeout(timer);
      let delay = RETRY_INTERVAL;
      try {
        delay = await tick();
      } catch {
        setIsConnected(false);
      } finally {
        ticking = false;
      }
      if (!stopped) timer = setTimeout(run, delay);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
        void run();
      }
    };
    const onOffline = () => setIsConnected(false);

    window.addEventListener("online", run);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    void run();

    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(identifyTimer);
      window.removeEventListener("online", run);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
      void wakeLock?.release();
    };
  }, []);

  return { phase, code, screenId, screenName, location, isConnected, isIdentifying, audio, setAudio, manifest, clockOffset };
}
