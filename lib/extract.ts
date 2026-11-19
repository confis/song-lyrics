import * as cheerio from "cheerio";
import OpenAI from "openai";

export type ExtractedSong = {
  title: string;
  artist: string;
  lyrics: string;
  chorus: string;
};

// Free OpenRouter models to try, in order. Free slugs come and go, so we keep
// several and fall back to the next one when a model is unavailable/rate-limited.
// Override with OPENROUTER_MODEL (a single slug, or a comma-separated list).
const DEFAULT_FREE_MODELS = [
  "google/gemini-2.0-flash-exp:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-small-3.2-24b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
];

type LLMConfig = {
  apiKey: string;
  baseURL?: string;
  models: string[];
  isOpenRouter: boolean;
};

function getLLMConfig(): LLMConfig | null {
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    const override = process.env.OPENROUTER_MODEL;
    const models = override
      ? override.split(",").map((s) => s.trim()).filter(Boolean)
      : DEFAULT_FREE_MODELS;
    return {
      apiKey: orKey,
      baseURL: "https://openrouter.ai/api/v1",
      models,
      isOpenRouter: true,
    };
  }
  const oaKey = process.env.OPENAI_API_KEY;
  if (oaKey) {
    return {
      apiKey: oaKey,
      models: [process.env.OPENAI_MODEL || "gpt-4o-mini"],
      isOpenRouter: false,
    };
  }
  return null;
}

async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; LyricsCollector/1.0; +https://example.com)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`לא הצלחתי להוריד את העמוד (סטטוס ${res.status})`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, header, footer, nav").remove();

  const pageTitle = $("title").first().text().trim();
  const bodyText = $("body")
    .text()
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return `PAGE TITLE: ${pageTitle}\n\n${bodyText}`.slice(0, 16000);
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
  for (const model of cfg.models) {
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
      // try the next model
    }
  }

  if (!raw) {
    const detail =
      lastErr instanceof Error ? ` (${lastErr.message})` : "";
    throw new Error(
      `לא הצלחתי לחלץ מילים — אף מודל זמין לא הגיב${detail}. אפשר להגדיר OPENROUTER_MODEL למודל אחר.`
    );
  }

  const parsed = parseJsonLoose(raw);
  if (!parsed) {
    return fallbackExtract(url, pageText);
  }

  const lyrics = (parsed.lyrics || "").trim();
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
