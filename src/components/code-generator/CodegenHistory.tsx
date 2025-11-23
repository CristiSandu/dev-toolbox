"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { History as HistoryIcon, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { HistoryPayload } from "@/components/code-generator/codegen-types";

interface HistoryEntryFromRust {
  id: number;
  mode: string;
  summary: string;
  payload: string;
  created_at: string;
}

interface HistoryEntry {
  id: number;
  createdAt: string;
  summary: string;
  payload: HistoryPayload;
}

interface CodegenHistoryProps {
  refreshToken: number;
  onLoadState: (payload: HistoryPayload) => void;
}

export function CodegenHistory({
  refreshToken,
  onLoadState,
}: CodegenHistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [search, setSearch] = useState("");

  // --- DB helpers ---

  const refreshHistory = async () => {
    try {
      const rows = await invoke<HistoryEntryFromRust[]>("get_codegen_history");
      const mapped: HistoryEntry[] = rows.map((row) => {
        let payload: HistoryPayload = { mode: "single" };
        try {
          payload = JSON.parse(row.payload) as HistoryPayload;
        } catch (e) {
          console.warn("Invalid payload JSON in history row", row.id, e);
        }
        return {
          id: row.id,
          createdAt: row.created_at,
          summary: row.summary,
          payload,
        };
      });

      setEntries(mapped);
      if (mapped.length && !selected) {
        setSelected(mapped[0]);
      }
    } catch (e) {
      console.error("Failed to load history", e);
      toast("Failed to load history", { description: String(e) });
    }
  };

  const deleteHistoryEntry = async (id: number) => {
    try {
      await invoke("delete_codegen_entry", { id });

      setEntries((prev) => prev.filter((e) => e.id !== id));

      setSelected((current) => {
        if (!current || current.id !== id) return current;
        const remaining = entries.filter((e) => e.id !== id);
        return remaining[0] ?? null;
      });

      toast("History entry deleted");
    } catch (e) {
      console.error("Failed to delete history entry", e);
      toast("Failed to delete history entry", { description: String(e) });
    }
  };

  // reload whenever parent bumps refreshToken
  useEffect(() => {
    void refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const text =
        e.summary +
        " " +
        (e.payload.singleText || "") +
        " " +
        (e.payload.multiText || "");
      return text.toLowerCase().includes(q);
    });
  }, [entries, search]);

  // --- UI ---

  return (
    <Card className="h-full flex flex-col bg-white">
      <CardHeader className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <HistoryIcon size={18} />
          <CardTitle>History</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search..."
            className="h-8 w-40 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => void refreshHistory()}
          >
            <RefreshCw size={14} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 flex gap-4 overflow-hidden">
        {/* LEFT: LIST */}
        <div className="w-1/3 border rounded p-2 overflow-auto space-y-2">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No history entries yet.
            </p>
          )}

          {filtered.map((entry) => (
            <div
              key={entry.id}
              onClick={() => setSelected(entry)}
              className={cn(
                "relative p-2 border rounded cursor-pointer hover:bg-muted transition text-xs",
                selected?.id === entry.id && "bg-muted"
              )}
            >
              {/* delete button */}
              <button
                className="absolute right-1 top-1 p-0.5 rounded hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteHistoryEntry(entry.id);
                }}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>

              <div className="flex justify-between items-center gap-2 pr-4">
                <span className="font-mono text-[10px] text-muted-foreground">
                  #{entry.id}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {entry.payload.mode.toUpperCase()}
                </span>
              </div>
              <div className="mt-1 truncate font-mono">{entry.summary}</div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {entry.createdAt}
              </div>
            </div>
          ))}
        </div>

        {/* RIGHT: DETAILS */}
        <div className="flex-1 border rounded p-3 overflow-hidden text-xs flex flex-col gap-3">
          {!selected && (
            <p className="text-muted-foreground text-sm">
              Select a history entry to see details.
            </p>
          )}

          {selected && (
            <>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] text-muted-foreground">
                    Entry #{selected.id}
                  </div>
                  <div className="font-mono text-xs">{selected.createdAt}</div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onLoadState(selected.payload)}
                  >
                    Duplicate into editor
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => void deleteHistoryEntry(selected.id)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="border-t pt-2 min-h-0 flex-1 flex flex-col">
                <div className="font-semibold mb-1">Payload (view only)</div>
                <div className="flex-1 min-h-0 w-full overflow-auto">
                  <pre
                    className="
                      bg-muted rounded p-2 text-[11px]
                      w-full
                      whitespace-pre-wrap wrap-break-word
                    "
                  >
                    {JSON.stringify(selected.payload, null, 2)}
                  </pre>
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
