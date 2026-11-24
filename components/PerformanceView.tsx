"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Teleprompter from "@/components/Teleprompter";

type Song = {
  id: string;
  title: string;
  artist: string | null;
  source_url: string | null;
  lyrics: string;
  chorus: string | null;
  position: number;
};

type EditFields = {
  title: string;
  artist: string;
  chorus: string;
  lyrics: string;
};

type SearchResult = {
  title: string;
  artist: string;
  url: string;
  thumbnail: string;
};

type LibItem = {
  id: string;
  title: string;
  artist: string | null;
  perf_name: string | null;
};

export default function PerformanceView({
  performance,
  onBack,
}: {
  performance: { id: string; name: string };
  onBack: () => void;
}) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [performSong, setPerformSong] = useState<Song | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [libOpen, setLibOpen] = useState(false);
  const [library, setLibrary] = useState<LibItem[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libFilter, setLibFilter] = useState("");
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [performance.id]);

  async function load() {
    try {
      const res = await fetch(
        `/api/songs?performance=${encodeURIComponent(performance.id)}`
      );
      const data = await res.json();
      setSongs(data.songs || []);
    } catch {
      setError("לא הצלחתי לטעון את רשימת השירים");
    }
  }

  const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());

  // Debounced autocomplete: when the input is a name (not a URL), search Genius.
  useEffect(() => {
    const q = url.trim();
    if (!q || isUrl(q)) {
      setResults([]);
      setSearchNote(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.error === "missing_genius_token") {
          setSearchNote(
            "כדי לחפש לפי שם צריך מפתח Genius. בינתיים אפשר להדביק לינק."
          );
          setResults([]);
        } else {
          setSearchNote(null);
          setResults(data.results || []);
        }
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [url]);

  async function addByUrl(link: string) {
    setError(null);
    setResults([]);
    setLoading(true);
    try {
      const res = await fetch("/api/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link, performanceId: performance.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה בהוספת השיר");
      } else {
        setSongs((prev) => [...prev, data.song]);
        setUrl("");
        setOpenId(data.song.id);
      }
    } catch {
      setError("שגיאת רשת — נסו שוב");
    } finally {
      setLoading(false);
    }
  }

  function addSong(e: React.FormEvent) {
    e.preventDefault();
    const value = url.trim();
    if (!value) return;
    if (isUrl(value)) addByUrl(value);
    else if (results.length) addByUrl(results[0].url);
  }

  async function toggleLibrary() {
    const open = !libOpen;
    setLibOpen(open);
    if (open) {
      setLibLoading(true);
      setLibFilter("");
      try {
        const res = await fetch("/api/library");
        const data = await res.json();
        setLibrary(data.songs || []);
      } catch {
        setLibrary([]);
      } finally {
        setLibLoading(false);
      }
    }
  }

  // Copy an already-fetched song from the library into this performance.
  async function addExisting(fromId: string) {
    setCopyingId(fromId);
    setError(null);
    try {
      const res = await fetch("/api/songs/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId, performanceId: performance.id }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "שגיאה בהוספת השיר");
      else setSongs((prev) => [...prev, data.song]);
    } catch {
      setError("שגיאת רשת — נסו שוב");
    } finally {
      setCopyingId(null);
    }
  }

  async function removeSong(id: string) {
    setSongs((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/songs/${id}`, { method: "DELETE" });
  }

  async function saveSong(
    id: string,
    fields: EditFields
  ): Promise<string | null> {
    try {
      const res = await fetch(`/api/songs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok) return data.error || "שגיאה בשמירת השיר";
      setSongs((prev) => prev.map((s) => (s.id === id ? data.song : s)));
      return null;
    } catch {
      return "שגיאת רשת — נסו שוב";
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = songs.findIndex((s) => s.id === active.id);
    const newIndex = songs.findIndex((s) => s.id === over.id);
    const next = arrayMove(songs, oldIndex, newIndex);
    setSongs(next);
    await fetch("/api/songs/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((s) => s.id) }),
    });
  }

  const haveKeys = new Set(
    songs.map(
      (s) =>
        `${s.title.trim().toLowerCase()}|${(s.artist || "")
          .trim()
          .toLowerCase()}`
    )
  );
  const libQ = libFilter.trim().toLowerCase();
  const filteredLibrary = library.filter((it) => {
    const key = `${(it.title || "").trim().toLowerCase()}|${(it.artist || "")
      .trim()
      .toLowerCase()}`;
    if (haveKeys.has(key)) return false; // already in this performance
    if (!libQ) return true;
    return (
      (it.title || "").toLowerCase().includes(libQ) ||
      (it.artist || "").toLowerCase().includes(libQ)
    );
  });

  return (
    <>
      <div className="perf-header">
        <button className="back-btn" onClick={onBack}>
          → ההופעות
        </button>
        <h1 className="perf-name">{performance.name}</h1>
      </div>

      <div className="search-wrap">
        <form className="add-box" onSubmit={addSong}>
          <input
            type="text"
            dir="auto"
            placeholder="חפשו שיר לפי שם, או הדביקו לינק…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
          />
          <button className="btn-add" type="submit" disabled={loading}>
            {loading ? (
              <>
                מחלץ מילים<span className="spinner" />
              </>
            ) : (
              "הוסף"
            )}
          </button>
        </form>

        {!loading && (searching || results.length > 0) && (
          <div className="suggest">
            {searching && results.length === 0 && (
              <div className="suggest-loading">מחפש…</div>
            )}
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                className="suggest-item"
                onClick={() => addByUrl(r.url)}
              >
                {r.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.thumbnail} alt="" className="suggest-thumb" />
                )}
                <span className="suggest-text">
                  <span className="suggest-title">{r.title}</span>
                  {r.artist && (
                    <span className="suggest-artist">{r.artist}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}
      <div className="hint">
        {searchNote ||
          "הקלידו שם שיר וקבלו הצעות, או הדביקו לינק ישיר (Shironet/Genius)."}
      </div>

      <button className="lib-toggle" onClick={toggleLibrary}>
        {libOpen ? "✕ סגור" : "➕ הוסף שיר שכבר יש לי"}
      </button>
      {libOpen && (
        <div className="lib-panel">
          <input
            className="lib-filter"
            type="text"
            dir="auto"
            placeholder="סנן לפי שם…"
            value={libFilter}
            onChange={(e) => setLibFilter(e.target.value)}
          />
          {libLoading ? (
            <div className="suggest-loading">טוען…</div>
          ) : filteredLibrary.length === 0 ? (
            <div className="suggest-loading">אין שירים זמינים להוספה.</div>
          ) : (
            <div className="lib-list">
              {filteredLibrary.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className="suggest-item"
                  disabled={copyingId === it.id}
                  onClick={() => addExisting(it.id)}
                >
                  <span className="suggest-text">
                    <span className="suggest-title">{it.title}</span>
                    <span className="suggest-artist">
                      {it.artist || ""}
                      {it.perf_name ? ` · מתוך: ${it.perf_name}` : ""}
                    </span>
                  </span>
                  <span className="lib-add">
                    {copyingId === it.id ? "…" : "הוסף"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {songs.length === 0 ? (
        <div className="empty">עדיין אין שירים בהופעה הזו. הוסיפו את הראשון ☝️</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={songs.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="list">
              {songs.map((song, i) => (
                <SortableCard
                  key={song.id}
                  song={song}
                  index={i}
                  open={openId === song.id}
                  onToggle={() =>
                    setOpenId(openId === song.id ? null : song.id)
                  }
                  onDelete={() => removeSong(song.id)}
                  onSave={saveSong}
                  onPerform={() => setPerformSong(song)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {performSong && (
        <Teleprompter song={performSong} onClose={() => setPerformSong(null)} />
      )}
    </>
  );
}

function SortableCard({
  song,
  index,
  open,
  onToggle,
  onDelete,
  onSave,
  onPerform,
}: {
  song: Song;
  index: number;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onSave: (id: string, fields: EditFields) => Promise<string | null>;
  onPerform: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: song.id });

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fields, setFields] = useState<EditFields>({
    title: song.title,
    artist: song.artist || "",
    chorus: song.chorus || "",
    lyrics: song.lyrics,
  });

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function startEdit() {
    setFields({
      title: song.title,
      artist: song.artist || "",
      chorus: song.chorus || "",
      lyrics: song.lyrics,
    });
    setEditErr(null);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setEditErr(null);
    const err = await onSave(song.id, fields);
    setSaving(false);
    if (err) {
      setEditErr(err);
    } else {
      setEditing(false);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card${isDragging ? " dragging" : ""}`}
    >
      <div className="card-head">
        <span
          className="handle"
          title="גררו כדי לסדר"
          {...attributes}
          {...listeners}
        >
          ⠿
        </span>
        <span className="num">{index + 1}</span>
        <div className="titles" onClick={onToggle} style={{ cursor: "pointer" }}>
          <div className="t">{song.title}</div>
          {song.artist && <div className="a">{song.artist}</div>}
        </div>
        <div className="card-actions">
          <button
            className="kebab"
            aria-label="פעולות"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="menu" onClick={(e) => e.stopPropagation()}>
              <button
                className="perform"
                onClick={() => {
                  setMenuOpen(false);
                  onPerform();
                }}
              >
                🎤 מצב הופעה
              </button>
              <button
                onClick={() => {
                  onToggle();
                  setMenuOpen(false);
                }}
              >
                {open ? "סגור מילים" : "הצג מילים"}
              </button>
              <button
                onClick={() => {
                  startEdit();
                  setMenuOpen(false);
                }}
              >
                ערוך
              </button>
              <button
                className="danger"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                מחק
              </button>
            </div>
          )}
        </div>
      </div>

      {(open || editing) && (
        <div className="card-body">
          {editing ? (
            <div className="edit-form">
              <label>
                <span>שם השיר</span>
                <input
                  type="text"
                  value={fields.title}
                  onChange={(e) =>
                    setFields({ ...fields, title: e.target.value })
                  }
                />
              </label>
              <label>
                <span>אמן</span>
                <input
                  type="text"
                  value={fields.artist}
                  onChange={(e) =>
                    setFields({ ...fields, artist: e.target.value })
                  }
                />
              </label>
              <label>
                <span>פזמון</span>
                <textarea
                  rows={4}
                  value={fields.chorus}
                  onChange={(e) =>
                    setFields({ ...fields, chorus: e.target.value })
                  }
                />
              </label>
              <label>
                <span>מילים</span>
                <textarea
                  rows={10}
                  value={fields.lyrics}
                  onChange={(e) =>
                    setFields({ ...fields, lyrics: e.target.value })
                  }
                />
              </label>
              {editErr && <div className="error">{editErr}</div>}
              <div className="edit-actions">
                <button
                  className="btn-add"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      שומר<span className="spinner" />
                    </>
                  ) : (
                    "שמור"
                  )}
                </button>
                <button
                  className="icon-btn"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            <>
              {song.chorus && (
                <div className="chorus">
                  <div className="label">פזמון</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{song.chorus}</div>
                </div>
              )}
              <div className="lyrics">{song.lyrics}</div>
              {song.source_url && (
                <div className="src">
                  מקור:{" "}
                  <a
                    href={song.source_url}
                    target="_blank"
                    rel="noreferrer"
                    dir="ltr"
                  >
                    {song.source_url}
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
