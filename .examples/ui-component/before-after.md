# Before / After — `ui-component`

---

## Scenario — "Add a Modal component"

### Before (no module `.ai/instruct.md`)

```tsx
// src/components/Modal.tsx
import styled from "styled-components";

const Backdrop = styled.div`
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
`;

export default function Modal({ children, onClose }: any) {
  return (
    <Backdrop onClick={onClose}>
      <div style={{ background: "white", padding: 24 }}>{children}</div>
    </Backdrop>
  );
}
```

Six rule violations:
1. `styled-components` (rule: Tailwind only).
2. Inline `style={{}}` (rule: no inline styles).
3. `any` props (rule: no `any`).
4. Default export (rule: named exports only).
5. No keyboard focus trap (rule: a11y).
6. No `aria-modal`/`role="dialog"` (rule: a11y).

### After (with [`.ai/instruct.md`](.ai/instruct.md))

```tsx
// src/components/Modal/Modal.tsx
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "../../lib/cn";
import type { ModalProps } from "./Modal.types";

export function Modal({ open, onOpenChange, title, children }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={cn("fixed inset-0 bg-black/50")} />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl bg-surface p-6 text-on-surface",
            "dark:bg-surface-dark dark:text-on-surface-dark",
          )}
        >
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Tailwind tokens, typed props in `Modal.types.ts`, named export, Radix handles focus trap and ARIA correctly.

---

## Why this matters

UI components quietly multiply: a single bad pattern ships to dozens of usages before anyone notices. The depth-priority `.ai/instruct.md` makes the AI bake the right defaults into every new component.
