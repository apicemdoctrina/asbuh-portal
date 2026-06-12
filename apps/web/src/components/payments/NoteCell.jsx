import { useState } from "react";
import { Check, X as XIcon, MessageSquare } from "lucide-react";
import { api } from "../../lib/api.js";

/** Inline-editable payment note for an organization row. */
export default function NoteCell({ orgId, initialNote }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(initialNote || "");
  const [saved, setSaved] = useState(initialNote || "");

  async function handleSave() {
    await api(`/api/payments/org/${orgId}/note`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setSaved(note);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") {
              setNote(saved);
              setEditing(false);
            }
          }}
          autoFocus
          className="px-2 py-1 border border-line rounded text-xs w-full min-w-[120px] focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        <button
          onClick={handleSave}
          className="text-green-600 dark:text-green-300 hover:text-green-700 dark:hover:text-green-300"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => {
            setNote(saved);
            setEditing(false);
          }}
          className="text-subtle hover:text-body"
        >
          <XIcon size={14} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1 text-xs text-subtle hover:text-primary transition-colors max-w-[200px] text-left"
      title={saved || "Добавить примечание"}
    >
      {saved ? (
        <span className="text-subtle truncate">{saved}</span>
      ) : (
        <>
          <MessageSquare size={12} />
          <span>примечание</span>
        </>
      )}
    </button>
  );
}
