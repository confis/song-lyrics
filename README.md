# סדר הופעה — Song Lyrics Setlist

אפליקציית Next.js לאיסוף וסידור מילות שירים. מדביקים לינק לעמוד של מילות שיר,
וה-AI (OpenAI) שולף את המילים ואת הפזמון. אפשר לערוך שירים, למחוק, ולסדר את
רשימת ההופעה בגרירה (drag & drop). ממשק עברית/RTL, עיצוב שחור-צהוב מותאם לנייד.

## הרצה מקומית

```bash
npm install
cp .env.local.example .env.local   # ומלאו את המפתחות
npm run dev
```

פתחו http://localhost:3000

## משתני סביבה

| משתנה | חובה | תיאור |
|-------|------|-------|
| `OPENROUTER_API_KEY` | כן (מועדף, חינם) | מפתח OpenRouter — https://openrouter.ai/keys. מופעל לפני OpenAI. |
| `OPENROUTER_MODEL` | לא | דגם חינמי, ברירת מחדל `meta-llama/llama-3.3-70b-instruct:free`. |
| `OPENAI_API_KEY` | חלופה | מפתח OpenAI (בשימוש רק אם אין `OPENROUTER_API_KEY`). |
| `OPENAI_MODEL` | לא | דגם ברירת מחדל `gpt-4o-mini`. |
| `TURSO_DATABASE_URL` / `DATABASE_URL` | לא | כתובת libSQL/Turso (`libsql://...`) לשמירה קבועה. |
| `TURSO_AUTH_TOKEN` / `DATABASE_AUTH_TOKEN` | לא | הטוקן של Turso. |

חילוץ המילים משתמש ב-API תואם-OpenAI: אם מוגדר `OPENROUTER_API_KEY` הוא עובד מול
OpenRouter (מודלים חינמיים), אחרת מול OpenAI. ללא אף מפתח — נשמר טקסט העמוד הגולמי.
ללא משתני מסד נתונים, האחסון הוא קובץ SQLite מקומי (`data/songs.db`).
ב-Vercel, בלי Turso, האחסון זמני (`/tmp`) ומתאפס — לכן מומלץ Turso בפרודקשן.

## פריסה ל-Vercel

1. חברו את ה-repo הזה ל-Vercel (Import Project).
2. הוסיפו את משתני הסביבה שלמעלה.
3. כל `git push` ל-`main` יפרוס אוטומטית.

## מבנה

- `app/` — דפים ו-API routes (Next.js App Router)
- `app/api/songs/` — CRUD + סידור (`reorder`)
- `lib/db.ts` — חיבור libSQL/SQLite
- `lib/extract.ts` — שליפת עמוד + חילוץ מילים ב-OpenAI
- `components/SongApp.tsx` — ה-UI כולל גרירה ועריכה
