import { Button } from "@/components/ui/button";
import { Sheet as Drawer } from "@/components/ui/sheet";

export interface SheetAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Red: it destroys something. */
  danger?: boolean;
}

/** At most two actions at a sheet's foot, the main one last, where the thumb is. */
export function SheetActions({ primary, secondary }: { primary?: SheetAction; secondary?: SheetAction }) {
  if (!primary && !secondary) return null;
  return (
    <div className="flex gap-2.5 border-t pt-4">
      {secondary && (
        <Button variant="secondary" size="lg" className="h-12 flex-1" onClick={secondary.onClick} disabled={secondary.disabled}>
          {secondary.label}
        </Button>
      )}
      {primary && (
        <Button variant={primary.danger ? "danger" : "primary"} size="lg" className="h-12 flex-1" onClick={primary.onClick} disabled={primary.disabled}>
          {primary.label}
        </Button>
      )}
    </div>
  );
}

/**
 * A sheet: its title, what it is for in one line, the content, and its
 * actions at the foot. It swipes away like every sheet
 * (components/ui/sheet.tsx).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  primary,
  secondary,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  primary?: SheetAction;
  secondary?: SheetAction;
  children: React.ReactNode;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="space-y-4">
        {children}
        <SheetActions primary={primary} secondary={secondary} />
      </div>
    </Drawer>
  );
}
