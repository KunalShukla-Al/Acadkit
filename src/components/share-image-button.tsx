import { useState } from "react";
import { toast } from "sonner";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shareCard } from "@/lib/shareCard";

/**
 * Share renders an image (`render`) and hands it to the share sheet,
 * falling back to a download where Web Share can't take files.
 */
export function ShareImageButton({ render, filename }: { render: () => Promise<Blob>; filename: string }) {
  const [busy, setBusy] = useState(false);

  async function onShare() {
    setBusy(true);
    try {
      const how = await shareCard(await render(), filename);
      toast.success(how === "shared" ? "Shared" : "Image saved");
    } catch (err) {
      toast.error((err as Error)?.message ?? "Couldn't create the image");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" className="shrink-0" disabled={busy} onClick={onShare}>
      <Share2 className="h-4 w-4" />
      {busy ? "Rendering…" : "Share"}
    </Button>
  );
}
