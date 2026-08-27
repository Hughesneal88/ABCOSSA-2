import { useState, useMemo } from "react";
import {
  FileSpreadsheet,
  Printer,
  Copy,
  Check,
  Award,
  Hash,
  Download,
  PhoneCall,
  Share2,
  ExternalLink,
} from "lucide-react";
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
import { AwardCategory, NomineeRow, UssdSettings } from "@/hooks/useNominees";

export interface NomineesExportModalProps {
  nominees: NomineeRow[];
  categories: AwardCategory[];
  ussdSettings?: UssdSettings;
  votePrice?: number;
  trigger?: React.ReactNode;
}

export function NomineesExportModal({
  nominees,
  categories,
  ussdSettings,
  votePrice = 1.0,
  trigger,
}: NomineesExportModalProps) {
  const [copiedText, setCopiedText] = useState(false);
  const [selectedCatFilter, setSelectedCatFilter] = useState<string>("all");

  const masterShortcode = ussdSettings?.shortcode || "*928*667#";
  const cleanShortcode = masterShortcode.replace(/#$/, "");

  // Group nominees by category
  const groupedNominees = useMemo(() => {
    const map: Record<string, { categoryTitle: string; displayOrder: number; list: NomineeRow[] }> = {};

    categories.forEach((c) => {
      map[c.id] = {
        categoryTitle: c.title,
        displayOrder: c.display_order,
        list: [],
      };
    });

    map["none"] = {
      categoryTitle: "General / Uncategorized",
      displayOrder: 999,
      list: [],
    };

    nominees.forEach((n) => {
      const key = n.category_id && map[n.category_id] ? n.category_id : "none";
      map[key].list.push(n);
    });

    // Sort nominees inside each category by code or name
    Object.values(map).forEach((group) => {
      group.list.sort((a, b) => {
        const codeA = parseInt(a.nominee_code || "999999", 10);
        const codeB = parseInt(b.nominee_code || "999999", 10);
        if (!isNaN(codeA) && !isNaN(codeB) && codeA !== codeB) return codeA - codeB;
        return a.name.localeCompare(b.name);
      });
    });

    return Object.entries(map)
      .filter(([, val]) => val.list.length > 0)
      .sort((a, b) => a[1].displayOrder - b[1].displayOrder);
  }, [nominees, categories]);

  // Export to CSV
  const handleExportCsv = () => {
    const headers = [
      "Category",
      "Nominee Code",
      "Full Name",
      "Department",
      "Level",
      "USSD Dial String",
      "Votes Count",
      "Status",
      "Bio / Citation",
    ];

    const rows: string[][] = [];

    groupedNominees.forEach(([, group]) => {
      group.list.forEach((n) => {
        const dialString = n.nominee_code ? `${cleanShortcode}*${n.nominee_code}#` : masterShortcode;
        rows.push([
          `"${group.categoryTitle.replace(/"/g, '""')}"`,
          `"${n.nominee_code || ""}"`,
          `"${n.name.replace(/"/g, '""')}"`,
          `"${(n.department || "").replace(/"/g, '""')}"`,
          `"${(n.level || "").replace(/"/g, '""')}"`,
          `"${dialString}"`,
          String(n.votes_count || 0),
          n.is_published ? "Published" : "Draft",
          `"${(n.bio || "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
        ]);
      });
    });

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `ABCOSSA_Nominees_Codes_Roster_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Nominees directory CSV downloaded successfully!");
  };

  // Copy Broadcast Markdown / Text Roster
  const handleCopyBroadcastText = () => {
    let text = `🏆 *ABCOSSA DINNER AWARDS 2026 — NOMINEES & USSD VOTING DIRECTORY*\n`;
    text += `📲 USSD Master Code: *${masterShortcode}*\n`;
    text += `💰 Voting Rate: GHS ${votePrice.toFixed(2)} per vote\n`;
    text += `🌐 Online Voting: https://abcossa.org/nominees\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    groupedNominees.forEach(([, group]) => {
      text += `📂 *${group.categoryTitle.toUpperCase()}*\n`;
      group.list.forEach((n, idx) => {
        const codeStr = n.nominee_code ? `#${n.nominee_code}` : "N/A";
        const dialStr = n.nominee_code ? `${cleanShortcode}*${n.nominee_code}#` : masterShortcode;
        const deptStr = n.department ? ` (${n.department})` : "";
        text += `${idx + 1}. *${n.name}*${deptStr} — Code: *${codeStr}* (Dial: \`${dialStr}\`)\n`;
      });
      text += `\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `To vote via mobile money on any network (MTN, Telecel, AT), dial *${masterShortcode}* or use the candidate direct dial code!`;

    navigator.clipboard.writeText(text);
    setCopiedText(true);
    toast.success("Broadcast roster copied to clipboard!");
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Print Roster Window
  const handlePrintRoster = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to open the printable directory");
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>ABCOSSA Dinner Awards 2026 - Nominees Directory</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap');
          body { font-family: 'Plus Jakarta Sans', sans-serif; padding: 30px; color: #0f172a; max-width: 900px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px solid #0d9488; padding-bottom: 18px; margin-bottom: 24px; }
          .title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0; }
          .sub { font-size: 13px; color: #64748b; margin: 0; }
          .ussd-banner { background: #f0fdfa; border: 1.5px solid #5eead4; border-radius: 12px; padding: 12px 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
          .ussd-code { font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 800; color: #0f766e; }
          .category-block { margin-bottom: 28px; page-break-inside: avoid; }
          .category-title { font-size: 16px; font-weight: 700; color: #0f766e; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { text-align: left; background: #f8fafc; padding: 8px 10px; border-bottom: 1.5px solid #cbd5e1; font-weight: 700; color: #475569; }
          td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
          .code-badge { font-family: 'JetBrains Mono', monospace; font-weight: 800; background: #0f172a; color: #fff; padding: 3px 8px; border-radius: 6px; font-size: 11px; display: inline-block; }
          .dial-str { font-family: 'JetBrains Mono', monospace; font-weight: 700; color: #0d9488; }
          .votes { font-weight: 700; color: #e11d48; text-align: right; }
          .footer { text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 30px; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">ABCOSSA DINNER AWARDS 2026</h1>
          <p class="sub">Official Nominees & USSD Voting Code Directory</p>
        </div>
        
        <div class="ussd-banner">
          <div>
            <strong>USSD Master Voting Code:</strong> Dial <span class="ussd-code">${masterShortcode}</span> on any mobile network (MTN, Telecel, AT)
          </div>
          <div>
            <strong>Rate:</strong> GHS ${votePrice.toFixed(2)} / vote
          </div>
        </div>

        ${groupedNominees
          .map(
            ([, group]) => `
          <div class="category-block">
            <h2 class="category-title">${group.categoryTitle} (${group.list.length} Nominees)</h2>
            <table>
              <thead>
                <tr>
                  <th style="width: 70px;">Code</th>
                  <th>Candidate Name</th>
                  <th>Department / Level</th>
                  <th>Direct USSD Dial</th>
                  <th style="text-align: right;">Votes</th>
                </tr>
              </thead>
              <tbody>
                ${group.list
                  .map(
                    (n) => `
                  <tr>
                    <td><span class="code-badge">${n.nominee_code || "N/A"}</span></td>
                    <td><strong>${n.name}</strong></td>
                    <td>${n.department || "—"} ${n.level ? `(${n.level})` : ""}</td>
                    <td class="dial-str">${n.nominee_code ? `${cleanShortcode}*${n.nominee_code}#` : masterShortcode}</td>
                    <td class="votes">${n.votes_count || 0}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `
          )
          .join("")}

        <div class="footer">
          Generated on ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} • Association of Biochemistry & Cell Biology Students (ABCOSSA)
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const totalPublishedNominees = nominees.filter((n) => n.is_published).length;

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="text-xs font-semibold gap-1.5 shadow-xs">
            <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
            Generate Nominee Codes List
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col bg-card border-border/60 p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border/60 bg-muted/20">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                Official Nominees & USSD Codes Directory
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Complete catalog of all {nominees.length} nominees ({totalPublishedNominees} published) with their assigned 3-digit voting codes and telecom dial strings.
              </DialogDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono font-bold bg-primary/10 border-primary/20 text-primary shrink-0">
              {masterShortcode}
            </Badge>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-3">
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleExportCsv} className="h-8 text-xs font-semibold gap-1.5">
                <Download className="w-3.5 h-3.5" /> Download CSV
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrintRoster} className="h-8 text-xs font-semibold gap-1.5">
                <Printer className="w-3.5 h-3.5" /> Print / Save PDF
              </Button>
              <Button size="sm" variant="outline" onClick={handleCopyBroadcastText} className="h-8 text-xs font-semibold gap-1.5">
                {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Broadcast List
              </Button>
            </div>

            {/* Quick Filter */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Category:</span>
              <select
                value={selectedCatFilter}
                onChange={(e) => setSelectedCatFilter(e.target.value)}
                className="h-8 text-xs bg-background border border-border/60 rounded-md px-2 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All Categories ({categories.length})</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </DialogHeader>

        {/* Directory Content List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {groupedNominees
            .filter(([catId]) => selectedCatFilter === "all" || catId === selectedCatFilter)
            .map(([catId, group]) => (
              <div key={catId} className="space-y-2.5">
                <div className="flex items-center justify-between pb-1 border-b border-border/40">
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    {group.categoryTitle}
                  </h4>
                  <Badge variant="secondary" className="text-[11px] font-semibold">
                    {group.list.length} {group.list.length === 1 ? "Nominee" : "Nominees"}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {group.list.map((n) => {
                    const dialString = n.nominee_code ? `${cleanShortcode}*${n.nominee_code}#` : masterShortcode;

                    return (
                      <div
                        key={n.id}
                        className="p-3 rounded-xl border border-border/60 bg-background/50 hover:bg-muted/30 transition-colors flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-foreground text-sm truncate">{n.name}</span>
                            {n.nominee_code && (
                              <Badge className="font-mono font-bold bg-primary text-primary-foreground text-[10px] px-1.5 py-0">
                                Code: #{n.nominee_code}
                              </Badge>
                            )}
                          </div>

                          <div className="text-muted-foreground text-[11px] flex items-center gap-2 flex-wrap">
                            {n.department && <span>{n.department}</span>}
                            {n.level && <span>• {n.level}</span>}
                            <span>• {n.votes_count || 0} votes</span>
                          </div>

                          {n.nominee_code && (
                            <div className="flex items-center gap-1 font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold pt-0.5">
                              <PhoneCall className="w-3 h-3" />
                              <span>Dial: {dialString}</span>
                            </div>
                          )}
                        </div>

                        {n.image_url ? (
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-border shrink-0 bg-muted">
                            <img src={n.image_url} alt={n.name} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center font-bold text-primary text-xs shrink-0">
                            {n.name
                              .split(" ")
                              .map((p) => p[0])
                              .slice(0, 2)
                              .join("")
                              .toUpperCase()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
