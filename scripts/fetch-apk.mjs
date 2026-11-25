// يُنزّل آخر نسخة من تطبيق أندرويد أثناء بناء الموقع، فتُحمَّل من نفس الموقع
// (التحميل من GitHub بطيء أو ينقطع في ليبيا). إن فشل التنزيل يكمل البناء دونه.
import { writeFile } from "node:fs/promises";

const SOURCE = "https://github.com/mmousay09/signage/releases/download/android-latest/signage-player.apk";

try {
  const response = await fetch(SOURCE, { redirect: "follow", signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 100_000) throw new Error("file too small");
  await writeFile("public/signage-player.apk", bytes);
  console.log(`Android app saved (${Math.round(bytes.length / 1024)} KB)`);
} catch (error) {
  console.warn(`Android app not downloaded: ${error.message}`);
}
