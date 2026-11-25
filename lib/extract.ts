import * as cheerio from "cheerio";
import OpenAI from "openai";

export type ExtractedSong = {
  title: string;
  artist: string;
  lyrics: string;
  chorus: string;
};

// Last-resort fallback list if runtime discovery fails. Free slugs change
// often, so the app prefers discovering the current free models at runtime.
const FALLBACK_FREE_MODELS = [
  "google/gemini-2.0-flash-exp:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

type LLMConfig = {
  apiKey: string;
  baseURL?: string;
  models: string[];
  isOpenRouter: boolean;
  hasOverride: boolean;
};

function getLLMConfig(): LLMConfig | null {
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    const override = process.env.OPENROUTER_MODEL;
    const models = override
      ? override.split(",").map((s) => s.trim()).filter(Boolean)
      : FALLBACK_FREE_MODELS;
    return {
      apiKey: orKey,
      baseURL: "https://openrouter.ai/api/v1",
      models,
      isOpenRouter: true,
      hasOverride: Boolean(override),
    };
  }
  const oaKey = process.env.OPENAI_API_KEY;
  if (oaKey) {
    return {
      apiKey: oaKey,
      models: [process.env.OPENAI_MODEL || "gpt-4o-mini"],
      isOpenRouter: false,
      hasOverride: true,
    };
  }
  return null;
}

// Ask OpenRouter which models are currently free, so we never hard-code slugs
// that quietly become paid. Returns ranked free text-model ids (best first).
async function discoverFreeModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const list: any[] = Array.isArray(data?.data) ? data.data : [];

    const free = list.filter((m) => {
      const p = m?.pricing;
      const isFree = p && p.prompt === "0" && p.completion === "0";
      const id: string = typeof m?.id === "string" ? m.id : "";
      if (!isFree || !id.includes(":free")) return false;
      const out = m?.architecture?.output_modalities;
      if (Array.isArray(out) && !out.includes("text")) return false;
      return true;
    });

    // Prefer well-known instruct/chat families for reliable JSON output.
    const fams = [
      "gemini",
      "llama",
      "deepseek",
      "qwen",
      "mistral",
      "gemma",
      "phi",
    ];
    const rank = (id: string) => {
      const i = fams.findIndex((f) => id.toLowerCase().includes(f));
      return i === -1 ? 99 : i;
    };

    return free
      .map((m) => m.id as string)
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, 10);
  } catch {
    return [];
  }
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
};

const LYRICS_MARK = "\n===LYRICS===\n";

function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  const pageTitle = $("title").first().text().trim();

  // Genius (and some others) keep lyrics in a dedicated container. Grab it
  // directly so the real lyrics aren't buried in page chrome or truncated.
  const containers = $(
    '[data-lyrics-container="true"], [class*="Lyrics__Container"], .lyrics'
  );
  if (containers.length) {
    containers.find("br").replaceWith("\n");
    let lyr = "";
    containers.each((_, el) => {
      lyr += $(el).text() + "\n";
    });
    lyr = lyr.replace(/\n{3,}/g, "\n\n").trim();
    if (lyr.length > 20) {
      return `PAGE TITLE: ${pageTitle}${LYRICS_MARK}${lyr}`.slice(0, 24000);
    }
  }

  $("script, style, noscript, svg, iframe, header, footer, nav").remove();
  const bodyText = $("body")
    .text()
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return `PAGE TITLE: ${pageTitle}\n\n${bodyText}`.slice(0, 24000);
}

// If the fetched text already carried a clean lyrics section (Genius
// container), pull it out as a reliable fallback.
function rawLyricsFromText(pageText: string): string {
  const i = pageText.indexOf(LYRICS_MARK);
  if (i === -1) return "";
  return pageText.slice(i + LYRICS_MARK.length).trim();
}

async function fetchPageText(url: string): Promise<string> {
  // 1) Direct fetch with browser-like headers.
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
    });
    if (res.ok) {
      const text = htmlToText(await res.text());
      if (text.replace(/^PAGE TITLE:.*$/m, "").trim().length > 40) return text;
    }
  } catch {
    /* fall through to the reader */
  }

  // 2) Fallback: Jina AI Reader fetches pages that block bots (Genius returns
  //    403 to server/data-center requests). Ask it for HTML so the same
  //    lyrics-container parser applies.
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        "X-Return-Format": "html",
        "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });
    if (res.ok) {
      const html = (await res.text()).trim();
      if (html) return htmlToText(html);
    }
  } catch {
    /* ignore */
  }

  throw new Error(
    "לא הצלחתי להוריד את עמוד המילים. נסו לינק אחר או שיר אחר."
  );
}

function fallbackExtract(url: string, pageText: string): ExtractedSong {
  const titleMatch = pageText.match(/PAGE TITLE: (.*)/);
  return {
    title: (titleMatch?.[1] || "שיר ללא שם").slice(0, 120),
    artist: "",
    lyrics: pageText.replace(/^PAGE TITLE: .*\n\n/, "").slice(0, 6000),
    chorus: "",
  };
}

// Parse JSON that may be wrapped in markdown code fences or surrounded by
// extra prose — common with free/open models that ignore response_format.
function parseJsonLoose(text: string): Partial<ExtractedSong> | null {
  let t = text.trim();
  t = t
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/g, "")
    .trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      /* give up */
    }
  }
  return null;
}

const SYSTEM_PROMPT =
  "אתה עוזר שמחלץ מילות שירים מתוך טקסט של עמוד אינטרנט. " +
  "מצא את מילות השיר המלאות, את שם השיר ואת שם האמן, וזהה את הפזמון. " +
  "החזר אך ורק JSON תקין במבנה: " +
  '{"title": string, "artist": string, "lyrics": string, "chorus": string}. ' +
  "השדה lyrics מכיל את כל מילות השיר כפי שהן, עם שבירות שורה (\\n). " +
  "השדה chorus מכיל את הפזמון החוזר בלבד (אם מופיע כמה פעמים – פעם אחת). " +
  "אל תמציא מילים שלא קיימות בטקסט. אם אין מילות שיר בעמוד, החזר lyrics ריק. " +
  "אל תוסיף טקסט, הסברים או סימוני קוד מחוץ ל-JSON.";

export async function extractSongFromUrl(url: string): Promise<ExtractedSong> {
  const pageText = await fetchPageText(url);

  const cfg = getLLMConfig();
  if (!cfg) {
    return fallbackExtract(url, pageText);
  }

  // Build the list of models to try. With OpenRouter and no explicit override,
  // discover the currently-free models first, then fall back to the static list.
  let models = cfg.models;
  if (cfg.isOpenRouter && !cfg.hasOverride) {
    const discovered = await discoverFreeModels(cfg.apiKey);
    if (discovered.length) {
      models = Array.from(new Set([...discovered, ...cfg.models]));
    }
  }

  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
    defaultHeaders: cfg.isOpenRouter
      ? {
          "HTTP-Referer": "https://song-lyrics-eight.vercel.app",
          "X-Title": "Setlist",
        }
      : undefined,
  });

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `כתובת העמוד: ${url}\n\nתוכן העמוד:\n${pageText}`,
    },
  ];

  // Try each model until one returns usable content. Fall to the next on any
  // provider error (model unavailable, rate limit, etc.).
  let raw = "";
  let lastErr: unknown = null;
  for (const model of models) {
    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0,
        messages,
      });
      const content = completion.choices[0]?.message?.content || "";
      if (content.trim()) {
        raw = content;
        break;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (!raw) {
    const detail = lastErr instanceof Error ? ` (${lastErr.message})` : "";
    throw new Error(
      `לא הצלחתי לחלץ מילים — אף מודל זמין לא הגיב${detail}. אפשר להגדיר OPENROUTER_MODEL למודל אחר.`
    );
  }

  const parsed = parseJsonLoose(raw);
  if (!parsed) {
    return fallbackExtract(url, pageText);
  }

  let lyrics = (parsed.lyrics || "").trim();
  if (!lyrics) {
    // The model returned nothing usable — fall back to the clean lyrics the
    // page parser already extracted (Genius container), if any.
    lyrics = rawLyricsFromText(pageText);
  }
  if (!lyrics) {
    throw new Error(
      "לא נמצאו מילות שיר בעמוד הזה. נסה לינק ישיר לעמוד של מילות השיר."
    );
  }

  return {
    title: (parsed.title || "שיר ללא שם").trim().slice(0, 200),
    artist: (parsed.artist || "").trim().slice(0, 200),
    lyrics,
    chorus: (parsed.chorus || "").trim(),
  };
}
