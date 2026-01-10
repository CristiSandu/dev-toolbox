"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import {
  ArrowRight,
  Loader2,
  Network,
  Printer,
  RefreshCcw,
  Repeat,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { PrintJob } from "@/lib/types/print";

type JobsByBatch = Record<string, PrintJob[]>;

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function StateBadge({ state }: { state: PrintJob["state"] }) {
  const styles: Record<PrintJob["state"], string> = {
    new: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100",
    printing:
      "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-100",
    done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100",
  };

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wide ${styles[state]}`}
    >
      {state}
    </span>
  );
}

export default function PrintQueue() {
  const [endpoint, setEndpoint] = useState<string>("");
  const [requestedBy, setRequestedBy] = useState<string>("");
  const [batchLabel, setBatchLabel] = useState<string>("");
  const [rawJobs, setRawJobs] = useState<string>("");
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [processing, setProcessing] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      const data = (await invoke("list_print_jobs")) as PrintJob[];
      setJobs(data);
    } catch (err) {
      console.error("Failed to load print jobs", err);
      toast("Unable to load print queue", {
        description: String(err),
      });
    }
  }, []);

  useEffect(() => {
    const savedEndpoint =
      localStorage.getItem("printer-endpoint") ?? "http://localhost:3333/print";
    const savedUser = localStorage.getItem("printer-user") ?? "";

    setEndpoint(savedEndpoint);
    setRequestedBy(savedUser);
    loadJobs();
  }, [loadJobs]);

  // Listen for backend events when new jobs are enqueued (HTTP or local).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("print-queue-updated", () => {
      loadJobs();
    }).then((off) => {
      unlisten = off;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [loadJobs]);

  useEffect(() => {
    localStorage.setItem("printer-endpoint", endpoint);
  }, [endpoint]);

  useEffect(() => {
    localStorage.setItem("printer-user", requestedBy);
  }, [requestedBy]);

  const groupedByBatch = useMemo<JobsByBatch>(() => {
    return jobs.reduce<JobsByBatch>((acc, job) => {
      if (!acc[job.batch_id]) {
        acc[job.batch_id] = [];
      }
      acc[job.batch_id].push(job);
      return acc;
    }, {});
  }, [jobs]);

  const stats = useMemo(() => {
    const total = jobs.length;
    const byState = jobs.reduce(
      (acc, job) => {
        acc[job.state] = (acc[job.state] ?? 0) + 1;
        return acc;
      },
      { new: 0, printing: 0, done: 0 } as Record<PrintJob["state"], number>
    );

    return { total, ...byState };
  }, [jobs]);

  const markProcessing = (jobId: number, active: boolean) => {
    setProcessing((prev) => {
      const next = new Set(prev);
      if (active) {
        next.add(jobId);
      } else {
        next.delete(jobId);
      }
      return next;
    });
  };

  const printJob = async (job: PrintJob) => {
    if (!endpoint.trim()) {
      toast("Add a printer endpoint to send jobs");
      return;
    }

    markProcessing(job.id, true);

    setJobs((prev) =>
      prev.map((item) =>
        item.id === job.id ? { ...item, state: "printing" } : item
      )
    );

    try {
      await invoke("update_print_job_state", {
        id: job.id,
        state: "printing",
        lastError: null,
        incrementCount: false,
      });

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: job.id,
          batchId: job.batch_id,
          payload: job.payload,
          requestedBy: job.requested_by,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(
          message || `Printer endpoint responded with ${response.status}`
        );
      }

      await invoke("update_print_job_state", {
        id: job.id,
        state: "done",
        lastError: null,
        incrementCount: true,
      });

      toast("Printed", {
        description: `Job #${job.id} sent to printer`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      await invoke("update_print_job_state", {
        id: job.id,
        state: "new",
        lastError: message,
        incrementCount: false,
      });

      toast("Failed to print", {
        description: message,
      });
    } finally {
      markProcessing(job.id, false);
      await loadJobs();
    }
  };

  const printBatch = async (batchId: string) => {
    const batchJobs = jobs.filter((job) => job.batch_id === batchId);
    if (!batchJobs.length) {
      return;
    }

    await invoke("requeue_batch", { batchId });
    await loadJobs();

    for (const job of batchJobs) {
      await printJob(job);
    }
  };

  const handleEnqueue = async (sendImmediately: boolean) => {
    const lines = rawJobs
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      toast("Add at least one line to print");
      return;
    }

    setSubmitting(true);

    try {
      const batchId =
        batchLabel.trim() || `batch-${new Date().toISOString()}`;
      const requester = requestedBy.trim() || "unknown";
      const created: PrintJob[] = [];

      for (const payload of lines) {
        const job = (await invoke("create_print_job", {
          batchId,
          requestedBy: requester,
          payload,
        })) as PrintJob;

        created.push(job);
      }

      toast("Jobs queued", {
        description: `${created.length} item(s) added to ${batchId}`,
      });

      setRawJobs("");
      setBatchLabel("");
      await loadJobs();

      if (sendImmediately) {
        for (const job of created) {
          await printJob(job);
        }
      }
    } catch (err) {
      console.error("Failed to enqueue print jobs", err);
      toast("Could not queue jobs", {
        description: String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="gap-4 h-full"
      autoSaveId="print-queue-panels"
    >
      <ResizablePanel defaultSize={40} minSize={30}>
        <div className="grid gap-4">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Printer className="size-5" />
                Printer Endpoint
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Jobs are POSTed to this local URL and tracked in the queue.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Network className="size-4" />
                  Local endpoint
                </label>
                <Input
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="http://192.168.1.50:3000/print"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Default user
                </label>
                <Input
                  value={requestedBy}
                  onChange={(e) => setRequestedBy(e.target.value)}
                  placeholder="operator name"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Queue new batch</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Batch label (optional)
                </label>
                <Input
                  value={batchLabel}
                  onChange={(e) => setBatchLabel(e.target.value)}
                  placeholder="e.g. lunch-run"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Lines to print (one per ticket)
                </label>
                <Textarea
                  value={rawJobs}
                  onChange={(e) => setRawJobs(e.target.value)}
                  placeholder="One line per job..."
                  className="min-h-32"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={submitting}
                  onClick={() => handleEnqueue(false)}
                  variant="secondary"
                >
                  {submitting ? (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCcw className="size-4 mr-2" />
                  )}
                  Queue only
                </Button>

                <Button
                  disabled={submitting}
                  onClick={() => handleEnqueue(true)}
                >
                  {submitting ? (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowRight className="size-4 mr-2" />
                  )}
                  Queue + send now
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Queue health</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Total</p>
                <p className="text-xl font-semibold">{stats.total}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Waiting</p>
                <p className="text-xl font-semibold">{stats.new}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Printing</p>
                <p className="text-xl font-semibold">{stats.printing}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Done</p>
                <p className="text-xl font-semibold">{stats.done}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel defaultSize={60} minSize={40} className="overflow-hidden">
        <Card className="h-full flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Queued jobs</CardTitle>
              <p className="text-sm text-muted-foreground">
                Reprint individual tickets or replay entire batches.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={loadJobs}
              disabled={submitting}
            >
              <RefreshCcw className="size-4 mr-2" />
              Refresh
            </Button>
          </CardHeader>

          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full">
              <div className="divide-y">
                {Object.entries(groupedByBatch).map(([batchId, batchJobs]) => (
                  <div key={batchId} className="p-4 space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Batch
                        </p>
                        <p className="font-semibold">{batchId}</p>
                      </div>

                      <div className="text-sm text-muted-foreground">
                        {batchJobs.length} job(s)
                      </div>

                      <div className="flex-1" />

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => printBatch(batchId)}
                        disabled={processing.size > 0}
                      >
                        <Repeat className="size-4 mr-2" />
                        Reprint batch
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {batchJobs.map((job) => {
                        const isWorking = processing.has(job.id);
                        return (
                          <div
                            key={job.id}
                            className="rounded-lg border p-3 bg-muted/40"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">
                                #{job.id} • {job.requested_by}
                              </p>
                              <StateBadge state={job.state} />
                              <span className="text-xs text-muted-foreground">
                                Prints: {job.print_count}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(job.created_at)}
                              </span>
                              <div className="flex-1" />
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => printJob(job)}
                                disabled={isWorking}
                              >
                                {isWorking ? (
                                  <Loader2 className="size-4 mr-2 animate-spin" />
                                ) : (
                                  <Printer className="size-4 mr-2" />
                                )}
                                {job.state === "done"
                                  ? "Reprint"
                                  : "Send to printer"}
                              </Button>
                            </div>

                            <p className="text-sm mt-2 break-words">
                              {job.payload}
                            </p>

                            {job.last_error ? (
                              <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                                <RefreshCcw className="size-3" />
                                {job.last_error}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {jobs.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    No jobs yet. Queue a batch to start printing.
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
