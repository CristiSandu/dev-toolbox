import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type Decision = "save" | "discard" | "cancel";
export function useUnsavedChanges(
  dirty: boolean,
  saving: boolean,
  save: () => Promise<boolean>,
  discard: () => void,
) {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((decision: Decision) => void) | null>(null);
  const current = useRef({ dirty, saving, save, discard });
  current.current = { dirty, saving, save, discard };
  const guard = useCallback(async () => {
    if (current.current.saving || resolver.current) return false;
    if (!current.current.dirty) return true;
    setOpen(true);
    const decision = await new Promise<Decision>((resolve) => {
      resolver.current = resolve;
    });
    if (decision === "save") return current.current.save();
    if (decision === "discard") {
      current.current.discard();
      return true;
    }
    return false;
  }, []);
  const answer = (decision: Decision) => {
    resolver.current?.(decision);
    resolver.current = null;
    setOpen(false);
  };
  const blocker = useBlocker(dirty || saving);
  const checking = useRef(false);
  useEffect(() => {
    if (blocker.state !== "blocked" || checking.current) return;
    checking.current = true;
    void guard()
      .then((proceed) => {
        if (proceed) blocker.proceed?.();
        else blocker.reset?.();
      })
      .finally(() => {
        checking.current = false;
      });
  }, [blocker, guard]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (current.current.dirty || current.current.saving) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    let disposed = false,
      unlisten: (() => void) | undefined;
    if (isTauri())
      void getCurrentWindow()
        .onCloseRequested(async (event) => {
          if (!current.current.dirty && !current.current.saving) return;
          event.preventDefault();
          if (await guard()) await getCurrentWindow().destroy();
        })
        .then((fn) => {
          if (disposed) fn();
          else unlisten = fn;
        });
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("beforeunload", beforeUnload);
      resolver.current?.("cancel");
      resolver.current = null;
    };
  }, [guard]);
  return {
    guard,
    dialog: (
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) answer("cancel");
        }}
      >
        <DialogContent>
          <DialogTitle>Save changes to this test case?</DialogTitle>
          <DialogDescription>
            Your case has unsaved changes. Save them before continuing, or
            discard this draft.
          </DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => answer("cancel")}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => answer("discard")}>
              Discard
            </Button>
            <Button onClick={() => answer("save")}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
  };
}
