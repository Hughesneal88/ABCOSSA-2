import { useState } from "react";
import { PhoneCall, Copy, Check, Smartphone, ShieldCheck, Sparkles, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useUssdSettings } from "@/hooks/useNominees";

export interface UssdInstructionsModalProps {
  nomineeName?: string;
  nomineeCode?: string | null;
  categoryTitle?: string;
  trigger?: React.ReactNode;
}

export function UssdInstructionsModal({
  nomineeName,
  nomineeCode,
  categoryTitle,
  trigger,
}: UssdInstructionsModalProps) {
  const [copied, setCopied] = useState(false);
  const { data: ussdSettings } = useUssdSettings();

  const shortcode = ussdSettings?.shortcode || "*713*22#";
  const cleanShortcode = shortcode.replace(/#$/, "");
  const fullDialString = nomineeCode ? `${cleanShortcode}*${nomineeCode}#` : shortcode;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`Copied ${label}: ${text}`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="rounded-lg gap-1.5 text-xs font-semibold">
            <PhoneCall className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Vote via USSD
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card border-border/60">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <Badge
              variant="outline"
              className="text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 gap-1"
            >
              <Smartphone className="w-3.5 h-3.5" />
              Hubtel USSD Voting
            </Badge>
          </div>
          <DialogTitle className="text-xl font-bold text-foreground mt-2">
            {nomineeName ? `Vote for ${nomineeName}` : "Vote via USSD"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Cast votes instantly on any phone without an active internet connection.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Candidate Code Card */}
          {nomineeCode && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  {categoryTitle || "Candidate Code"}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Hash className="w-4 h-4 text-primary" />
                  <span className="text-2xl font-black text-foreground">{nomineeCode}</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleCopy(nomineeCode, "Candidate Code")}
                className="text-xs font-semibold gap-1"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Code
              </Button>
            </div>
          )}

          {/* Quick Dial Card */}
          <div className="p-4 rounded-xl bg-muted/40 border border-border/60 space-y-2">
            <span className="text-xs font-medium text-muted-foreground block">USSD Quick Dial String:</span>
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-background border border-border/60">
              <span className="font-mono text-sm sm:text-base font-bold text-foreground">{fullDialString}</span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleCopy(fullDialString, "USSD String")}
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
                <Button size="sm" className="h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1" asChild>
                  <a href={`tel:${encodeURIComponent(fullDialString)}`}>
                    <PhoneCall className="w-3 h-3" /> Dial Now
                  </a>
                </Button>
              </div>
            </div>
          </div>

          {/* Step-by-Step Instructions */}
          <div className="space-y-2 pt-1">
            <h5 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> How to Cast Your Vote:
            </h5>
            <ol className="space-y-2 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center">
                  1
                </span>
                <span>
                  Dial <strong className="text-foreground">{shortcode}</strong> on your phone (MTN, Telecel, or AT).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center">
                  2
                </span>
                <span>
                  Enter Candidate Code: <strong className="text-foreground">{nomineeCode || "[Candidate Code]"}</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center">
                  3
                </span>
                <span>Enter the number of votes you wish to purchase.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center">
                  4
                </span>
                <span>Authorize the Mobile Money PIN prompt on your phone to complete your vote.</span>
              </li>
            </ol>
          </div>

          {/* Network Badges */}
          <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Works on all networks:
            </span>
            <span className="font-semibold text-foreground">MTN • Telecel • AT Money</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
