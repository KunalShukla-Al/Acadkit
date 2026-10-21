import { createContext, useContext } from "react";

/** The in-app confirm and prompt (DialogProvider in components/ui/dialog.tsx). */

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  /** Red button, for anything that destroys data. */
  destructive?: boolean;
}

export interface PromptOptions {
  title: string;
  body?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

export interface DialogApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  promptText: (options: PromptOptions) => Promise<string | null>;
}

export const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error("useDialog must be used inside DialogProvider");
  return api;
}
