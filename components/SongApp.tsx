"use client";

import { useEffect, useState } from "react";
import PerformanceView from "@/components/PerformanceView";

type Performance = {
  id: string;
  name: string;
  position: number;
  created_at: number;
  song_count: number;
};

export default function SongApp() {
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Performance | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  useEffect(() => {
    loadPerformances();
  }, []);

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuId]);

  async function loadPerformances() {
    try {
      const res = await fetch("/api/performances");
      const data = await res.json();
      setPerformances(data.performances || []);
    } catch {
      setError("לא הצלחתי לטעון את ההופעות");
    } finally {
      setLoaded(true);
    }
  }

  async function createPerformance(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = name.trim();
    if (!value) return;
    setCreating(true);
    try {
      const res = await fetch("/api/performances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה ביצירת ההופעה");
      } else {
        setPerformances((prev) => [...prev, data.performance]);
        setName("");
      }
    } catch {
      setError("שגיאת רשת — נסו שוב");
    } finally {
      setCreating(false);
    }
  }

  async function removePerformance(id: string) {
    setPerformances((prev) => prev.filter((p) => p.id !== id));
    await fetch(`/api/performances/${id}`, { method: "DELETE" });
  }

  async function saveRename(id: string) {
    const value = renameText.trim();
    if (!value) {
      setRenameId(null);
      return;
    }
    setPerformances((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: value } : p))
    );
    setRenameId(null);
    await fetch(`/api/performances/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: value }),
    });
  }

  // Inside a performance → show its songs.
  if (current) {
    return (
      <PerformanceView
        performance={current}
        onBack={() => {
          setCurrent(null);
          loadPerformances();
        }}
      />
    );
  }

  return (
    <>
      <div className="header">
        <h1>🎤 ההופעות שלי</h1>
        <p>
          צרו הופעה, הוסיפו לה שירים לפי לינק (ה-AI שולף מילים ופזמון), וסדרו
          בגרירה. לכל הופעה רשימת שירים וסדר משלה.
        </p>
      </div>
      <form className="add-box" onSubmit={createPerformance}>
        <input
          type="text"
          placeholder="שם ההופעה (למשל: חתונה של דני)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={creating}
        />
        <button className="btn-add" type="submit" disabled={creating}>
          {creating ? (
            <>
              יוצר<span className="spinner" />
            </>
          ) : (
            "הופעה חדשה"
          )}
        </button>
      </form>
      {error && <div className="error">{error}</div>}

      {loaded && performances.length === 0 ? (
        <div className="empty">
          עדיין אין הופעות. צרו את הראשונה למעלה ☝️
          <br />
          לכל הופעה רשימת שירים וסדר משלה.
        </div>
      ) : (
        <div className="list">
          {performances.map((p) => (
            <div className="perf-card" key={p.id}>
              {renameId === p.id ? (
                <div className="perf-rename">
                  <input
                    autoFocus
                    type="text"
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename(p.id);
                      if (e.key === "Escape") setRenameId(null);
                    }}
                  />
                  <button className="btn-add" onClick={() => saveRename(p.id)}>
                    שמור
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => setRenameId(null)}
                  >
                    ביטול
                  </button>
                </div>
              ) : (
                <>
                  <div
                    className="perf-main"
                    onClick={() => setCurrent(p)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="perf-title">🎤 {p.name}</div>
                    <div className="perf-sub">
                      {p.song_count} שירים
                    </div>
                  </div>
                  <div className="card-actions">
                    <button
                      className="kebab"
                      aria-label="פעולות"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuId(menuId === p.id ? null : p.id);
                      }}
                    >
                      ⋯
                    </button>
                    {menuId === p.id && (
                      <div
                        className="menu"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => {
                            setMenuId(null);
                            setCurrent(p);
                          }}
                        >
                          פתח
                        </button>
                        <button
                          onClick={() => {
                            setMenuId(null);
                            setRenameText(p.name);
                            setRenameId(p.id);
                          }}
                        >
                          שנה שם
                        </button>
                        <button
                          className="danger"
                          onClick={() => {
                            setMenuId(null);
                            removePerformance(p.id);
                          }}
                        >
                          מחק הופעה
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
