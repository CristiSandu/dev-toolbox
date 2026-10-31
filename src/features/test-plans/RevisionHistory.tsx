import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { historyDate } from "@/lib/history";
import { MarkdownDescription } from "./MarkdownDescription";
import type { CaseRevision } from "./model";

export function RevisionHistory({
  caseId,
  onClose,
}: {
  caseId: number;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<CaseRevision[]>([]),
    [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    void invoke<CaseRevision[]>("get_test_case_revisions", { caseId })
      .then((rows) => {
        if (alive) {
          setEntries(rows);
          setSelected(rows[0]?.revision ?? null);
        }
      })
      .catch((error) => {
        if (alive) setError(String(error));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [caseId, reload]);
  const current = entries.find((entry) => entry.revision === selected),
    previous = entries.find((entry) => entry.revision === (selected ?? 0) - 1);
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="tp-history-dialog">
        <DialogTitle>Case history</DialogTitle>
        <DialogDescription>
          Saved revisions, newest first. Select a revision to inspect its
          description and product lists.
        </DialogDescription>
        {error ? (
          <div role="alert" className="inline-notice error-notice">
            {error}
            <Button onClick={() => setReload((value) => value + 1)}>
              Retry
            </Button>
          </div>
        ) : loading ? (
          <p role="status">Loading revisions…</p>
        ) : (
          <div className="tp-history-layout">
            <div className="tp-revisions" aria-label="Saved revisions">
              {entries.map((entry) => (
                <button
                  key={entry.revision}
                  className={entry.revision === selected ? "is-selected" : ""}
                  onClick={() => setSelected(entry.revision)}
                >
                  <strong>Revision {entry.revision}</strong>
                  <time>{historyDate(entry.createdAt)}</time>
                  <span>
                    {entry.changes.length === 1
                      ? entry.changes[0]
                      : `${entry.changes.length} changes`}
                  </span>
                </button>
              ))}
            </div>
            {current && (
              <div className="tp-revision-detail">
                <h2>{current.snapshot.title}</h2>
                <ul className="tp-change-list">
                  {current.changes.map((change, index) => (
                    <li key={index}>{change}</li>
                  ))}
                </ul>
                <h3>Description</h3>
                <MarkdownDescription
                  source={
                    current.snapshot.descriptionMarkdown || "*No description*"
                  }
                />
                <details>
                  <summary>Markdown source changes</summary>
                  <div className="tp-source-diff">
                    <div>
                      <h4>Previous revision</h4>
                      <pre>
                        {previous?.snapshot.descriptionMarkdown || "(empty)"}
                      </pre>
                    </div>
                    <div>
                      <h4>This revision</h4>
                      <pre>
                        {current.snapshot.descriptionMarkdown || "(empty)"}
                      </pre>
                    </div>
                  </div>
                </details>
                {current.snapshot.lists.map((list) => (
                  <section key={list.id}>
                    <h3>
                      {list.name} · {list.products.length} products
                    </h3>
                    <div className="tp-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Title</th>
                            <th>Value</th>
                            <th>Format</th>
                            <th>Image URL</th>
                            <th>Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.products.map((product) => (
                            <tr key={product.id}>
                              <td>{product.title}</td>
                              <td>{product.text}</td>
                              <td>{product.type}</td>
                              <td>{product.imageUrl}</td>
                              <td>{product.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
                <details>
                  <summary>Complete saved content changes</summary>
                  <div className="tp-source-diff">
                    <div>
                      <h4>Previous revision</h4>
                      <pre>
                        {previous
                          ? JSON.stringify(previous.snapshot, null, 2)
                          : "(new case)"}
                      </pre>
                    </div>
                    <div>
                      <h4>This revision</h4>
                      <pre>{JSON.stringify(current.snapshot, null, 2)}</pre>
                    </div>
                  </div>
                </details>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
