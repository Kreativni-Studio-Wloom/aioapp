"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/utils";

/** A <form> bound to a (prev, formData) server action that shows the returned error under the form. */
export function ActionForm({
  action,
  className,
  wrapClassName,
  children,
}: {
  action: (prev: ActionResult | undefined, form: FormData) => Promise<ActionResult>;
  className?: string;
  wrapClassName?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <div className={wrapClassName}>
      <form action={formAction} className={className}>
        {children}
      </form>
      {state && !state.ok && (
        <p role="alert" className="mt-1.5 text-sm text-neg">
          {state.error}
        </p>
      )}
    </div>
  );
}
