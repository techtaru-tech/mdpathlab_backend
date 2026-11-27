import { useCallback, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  /** Text or a small summary block shown under the title. */
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for withdraw / delete / switch-on style actions. */
  tone?: "primary" | "danger";
};

/**
 * A styled confirm popup in place of the browser's window.confirm:
 *   const [confirm, confirmDialog] = useConfirm();
 *   if (!(await confirm({ title: "Save MOU?", description: "…" }))) return;
 *   …and render {confirmDialog} once in the component.
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    resolver.current?.(false);
    setOptions(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  const danger = options?.tone === "danger";
  const Icon = danger ? AlertTriangle : HelpCircle;
  const dialog = (
    <AlertDialog open={options !== null} onOpenChange={(open) => !open && close(false)}>
      <AlertDialogContent className="max-w-md rounded-2xl">
        <AlertDialogHeader className="items-center text-center sm:text-center">
          <span className={cn("grid h-14 w-14 place-items-center rounded-full", danger ? "bg-destructive/10 text-destructive" : "bg-primary-soft text-primary")}>
            <Icon className="h-7 w-7" />
          </span>
          <AlertDialogTitle className="mt-2 text-lg font-extrabold">{options?.title}</AlertDialogTitle>
          {options?.description ? (
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground">{options.description}</div>
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 gap-2 sm:justify-center">
          <AlertDialogCancel onClick={() => close(false)} className="rounded-xl font-bold">
            {options?.cancelLabel ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={cn("rounded-xl font-bold", danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90")}
          >
            {options?.confirmLabel ?? "Yes, continue"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return [confirm, dialog];
}
