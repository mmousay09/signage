import type { ManifestKiosk, ManifestProgram, PlayerManifest } from "@/player/offline/store";

export type ResolvedContent = (
  | { kind: "program"; key: string; version: string; program: ManifestProgram }
  | { kind: "contract-empty"; key: string; title: string }
  | { kind: "available"; key: "available" }
) & { kiosk?: { contractTitle: string; data: ManifestKiosk } };

export function resolveContent(manifest: PlayerManifest, now: number): ResolvedContent {
  const contract = manifest.contracts?.find(
    (item) => Date.parse(item.starts_at) <= now && now < Date.parse(item.ends_at),
  );
  if (contract) {
    const key = `contract:${contract.id}`;
    const kiosk = contract.kiosk ? { contractTitle: contract.title, data: contract.kiosk } : undefined;
    return contract.program.items.length
      ? { kind: "program", key, version: `${manifest.version}:${key}`, program: contract.program, kiosk }
      : { kind: "contract-empty", key, title: contract.title, kiosk };
  }

  // نسخة محفوظة من قبل المرحلة 3 لا تحتوي idle، فتُستخدم قائمتها السابقة
  const idle = manifest.contracts === undefined ? manifest.program : manifest.idle;
  return idle?.items.length
    ? { kind: "program", key: "idle", version: `${manifest.version}:idle`, program: idle }
    : { kind: "available", key: "available" };
}
