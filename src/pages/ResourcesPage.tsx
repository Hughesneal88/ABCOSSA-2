import { useState } from "react";
import { ExternalLink, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePublicResources } from "@/hooks/useSupabasePublic";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { RESOURCES_TELEGRAM_URL } from "@/config/site";

const YEARS = ["L100", "L200", "L300", "L400"] as const;

const SEMESTERS = [
  { key: "1st", label: "1st Semester" },
  { key: "2nd", label: "2nd Semester" },
] as const;

const YEAR_ORDER: Record<string, number> = { L100: 0, L200: 1, L300: 2, L400: 3 };
const SEM_ORDER: Record<string, number> = { "1st": 0, "2nd": 1 };

type Resource = { id: string; year: string; semester: string; label: string; drive_url: string; display_order: number };

function sortResources(arr: Resource[]): Resource[] {
  return [...arr].sort((a, b) => {
    const y = (YEAR_ORDER[a.year] ?? 99) - (YEAR_ORDER[b.year] ?? 99);
    if (y !== 0) return y;
    const s = (SEM_ORDER[a.semester] ?? 99) - (SEM_ORDER[b.semester] ?? 99);
    if (s !== 0) return s;
    return a.display_order - b.display_order;
  });
}

// Static fallback when Supabase is not configured
const STATIC_RESOURCES: Resource[] = [
  { id: "s1", year: "L100", semester: "1st", label: "L100 1st Semester Study Materials", drive_url: "https://drive.google.com/drive/folders/1f_xkJvvxjj2cN1IopaAPubwTtG_47COU", display_order: 0 },
  { id: "s2", year: "L200", semester: "1st", label: "L200 1st Semester Study Materials", drive_url: "https://drive.google.com/drive/folders/1Q_PMGMayHe77gznEJTy7gw1rCxzOnhTd", display_order: 0 },
  { id: "s3", year: "L200", semester: "1st", label: "L200 1st Semester Study Materials — 2", drive_url: "https://drive.google.com/drive/folders/1lYJZ4F95os6tuZxQU9mcrQQRdM8nd2wr", display_order: 1 },
  { id: "s4", year: "L200", semester: "1st", label: "L200 1st Semester Study Materials — 3", drive_url: "https://drive.google.com/drive/folders/1n9G5AaEBJRVAs1NjEOZvu8jJKzTwa0dY", display_order: 2 },
  { id: "s5", year: "L200", semester: "1st", label: "L200 1st Semester Study Materials — 4", drive_url: "https://drive.google.com/drive/folders/1HS8Ship1M13pgazTr2Xir-Gcbu0IJqi0", display_order: 3 },
  { id: "s6", year: "L200", semester: "2nd", label: "L200 2nd Semester Study Materials", drive_url: "https://drive.google.com/drive/folders/193HFnY2cB2Fdjuw8BDCUAKdbotazo44-", display_order: 0 },
  { id: "s7", year: "L300", semester: "2nd", label: "L300 2nd Semester Study Materials", drive_url: "https://drive.google.com/drive/folders/1AGoxdFKwY9bjM0xFMvTAAcy6t4FIxR0h", display_order: 0 },
  { id: "s8", year: "L400", semester: "2nd", label: "L400 2nd Semester Study Materials", drive_url: "https://drive.google.com/drive/folders/1DZcqrxOwIQIzOLJxyTK7x4B-Xtp8pJLR", display_order: 0 },
];

export default function ResourcesPage() {
  const { data: dbResources = [], isLoading } = usePublicResources();
  const raw = isSupabaseConfigured ? dbResources : STATIC_RESOURCES;
  const resources = sortResources(raw as Resource[]);

  const [yearFilter, setYearFilter] = useState("All");
  const [semesterFilter, setSemesterFilter] = useState("All");

  const filtered = resources.filter((r) => {
    const yearOk = yearFilter === "All" || r.year === yearFilter;
    const semOk = semesterFilter === "All" || r.semester === semesterFilter;
    return yearOk && semOk;
  });

  const filterBtn = (active: boolean) =>
    `px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "bg-background border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/20"
    }`;

  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="relative py-20 md:py-28 bg-gradient-nature">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="font-display text-4xl md:text-5xl font-bold text-primary-foreground mb-6 animate-fade-up">
              Resources
            </h1>
            <p className="text-xl text-primary-foreground/90 animate-fade-up delay-100">
              Study materials and resources for every year and semester.
              Filter by your level and semester, then open the Google Drive folder.
            </p>
          </div>
        </div>
      </section>

      {/* Filters + grid */}
      <section className="py-14 md:py-18">
        <div className="container mx-auto px-4 lg:px-8">

          {/* Filter controls */}
          <div className="space-y-5 mb-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">Year</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={filterBtn(yearFilter === "All")} onClick={() => setYearFilter("All")}>
                  All years
                </button>
                {YEARS.map((y) => (
                  <button key={y} type="button" className={filterBtn(yearFilter === y)} onClick={() => setYearFilter(y)}>
                    {y}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">Semester</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={filterBtn(semesterFilter === "All")} onClick={() => setSemesterFilter("All")}>
                  All semesters
                </button>
                {SEMESTERS.map((s) => (
                  <button key={s.key} type="button" className={filterBtn(semesterFilter === s.key)} onClick={() => setSemesterFilter(s.key)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results */}
          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card-nature rounded-2xl p-6 animate-pulse h-40 bg-muted/50" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              <FolderOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">No study materials available for this filter yet — check back soon.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((resource) => (
                <a
                  key={resource.id}
                  href={resource.drive_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card-nature rounded-2xl p-6 flex flex-col gap-4 group hover:shadow-elevated transition-all duration-300"
                >
                  <div className="flex gap-2 flex-wrap">
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
                      {resource.year}
                    </span>
                    <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-accent/20 text-accent-foreground">
                      {resource.semester} Semester
                    </span>
                  </div>

                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <FolderOpen className="w-5 h-5 text-primary" />
                    </div>
                    <p className="font-display font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
                      {resource.label}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 text-sm font-medium text-primary group-hover:gap-2.5 transition-all mt-auto">
                    Open in Google Drive
                    <ExternalLink className="w-4 h-4" />
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Telegram study materials */}
      <section className="py-12 border-t border-border bg-muted/30">
        <div className="container mx-auto px-4 lg:px-8 max-w-2xl text-center">
          <p className="text-muted-foreground mb-4 text-sm">
            Looking for more? The ABCOSSA study materials channel on Telegram has additional resources shared by members.
          </p>
          <Button variant="outline" asChild>
            <a href={RESOURCES_TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
              ABCOSSA study materials (Telegram)
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}
