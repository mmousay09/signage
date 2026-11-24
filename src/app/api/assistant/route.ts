// إجابة المساعد بالذكاء الاصطناعي عن سؤال ليس في الأسئلة الجاهزة.
// يحتاج المتغير ANTHROPIC_API_KEY في إعدادات Netlify؛ المفتاح يبقى على الخادم ولا يصل للشاشات.

import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

const LANGUAGE_NAME = { ar: "Arabic (simple Modern Standard Arabic that a Libyan visitor understands)", fr: "French", en: "English" } as const;
type Language = keyof typeof LANGUAGE_NAME;

interface EventContext {
  id: string;
  assistant: string;
  event: string;
  starts_at: string;
  ends_at: string;
  host: string | null;
  contact_phone: string | null;
  notes: string | null;
  agenda: { title: string; speaker: string | null; place: string | null; starts_at: string; ends_at: string | null }[];
  answers: { question: string; answer: string }[];
}

const tripoli = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Tripoli",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value))
    : "";

function systemPrompt(context: EventContext, language: Language) {
  const agenda = context.agenda
    .map((item) =>
      [`- ${tripoli(item.starts_at)}${item.ends_at ? ` to ${tripoli(item.ends_at)}` : ""}: ${item.title}`,
        item.speaker && `speaker: ${item.speaker}`, item.place && `place: ${item.place}`]
        .filter(Boolean)
        .join(", "),
    )
    .join("\n");
  const answers = context.answers.map((item) => `Q: ${item.question}\nA: ${item.answer}`).join("\n\n");
  return `You are ${context.assistant}, the reception assistant on a touch screen at the event "${context.event}"${
    context.host ? `, hosted by ${context.host}` : ""
  }. Visitors ask you questions in person, and your answer is shown on screen and read aloud.

Rules:
- Answer in ${LANGUAGE_NAME[language]}.
- Use only the event information below. If the answer is not there, say briefly that you don't know and suggest asking the reception desk${
    context.contact_phone ? ` or calling ${context.contact_phone}` : ""
  }. Never invent times, places, names or prices.
- Keep it to one to three short sentences, in plain text with no lists, symbols or markdown, so it sounds natural when spoken.
- Be warm and polite. Politely decline anything unrelated to the event or inappropriate.

Event information (times are Libya time):
Now: ${tripoli(new Date().toISOString())}
Event dates: ${tripoli(context.starts_at)} to ${tripoli(context.ends_at)}
${agenda ? `Program:\n${agenda}\n` : ""}${context.notes ? `Notes from the organizer:\n${context.notes}\n` : ""}${
    answers ? `Prepared answers:\n${answers}` : ""
  }`;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const body = (await request.json().catch(() => null)) as { contract?: string; question?: string; language?: string } | null;
  const question = body?.question?.trim().slice(0, 300);
  const language: Language = body?.language === "fr" || body?.language === "en" ? body.language : "ar";
  if (!token || !body?.contract || !question) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // بجلسة الشاشة نفسها: قاعدة البيانات تتحقق أنها شاشة مرتبطة بالعقد، وتطبق حد الاستهلاك
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("begin_ai_question", {
    p_contract: body.contract,
    p_question: question,
    p_language: language,
  });
  if (error || !data) {
    const status = error?.message.includes("quota") ? 429 : 403;
    return NextResponse.json({ error: status === 429 ? "quota" : "forbidden" }, { status });
  }
  const context = data as EventContext;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      max_tokens: 300,
      system: systemPrompt(context, language),
      messages: [{ role: "user", content: question }],
    }),
    signal: AbortSignal.timeout(18_000),
  }).catch(() => null);

  if (!response?.ok) return NextResponse.json({ error: "ai_failed" }, { status: 502 });
  const result = (await response.json()) as { content?: { type: string; text?: string }[] };
  const answer = (result.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join(" ")
    .replace(/[*#_`]/g, "")
    .trim()
    .slice(0, 1500);
  if (!answer) return NextResponse.json({ error: "ai_failed" }, { status: 502 });

  await supabase.rpc("finish_ai_question", { p_id: context.id, p_answer: answer });
  return NextResponse.json({ answer });
}
