import { useState } from "react";
import {
  ArrowUpDown,
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  Mail,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLecturers, usePublishedResearchWorks, type PublicResearchWork } from "@/hooks/useSupabasePublic";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = ["Paper", "Thesis", "Project", "Report", "Poster", "Abstract", "Other"];

type SortKey = "newest" | "oldest" | "az";

function sortWorks(works: PublicResearchWork[], sort: SortKey): PublicResearchWork[] {
  return [...works].sort((a, b) => {
    if (sort === "newest") return (b.year ?? 0) - (a.year ?? 0);
    if (sort === "oldest") return (a.year ?? 0) - (b.year ?? 0);
    return a.title.localeCompare(b.title);
  });
}

function WorkDetailDialog({
  work,
  onClose,
}: {
  work: PublicResearchWork | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(work)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {work && (
          <>
            <DialogHeader>
              <div className="flex flex-wrap gap-2 items-center mb-2">
                <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
                  {work.category}
                </span>
                {work.year && (
                  <span className="text-xs text-muted-foreground">{work.year}</span>
                )}
                <span className="text-xs text-muted-foreground capitalize">
                  {work.author_type.replace("-", " ")}
                </span>
              </div>
              <DialogTitle className="font-display text-xl leading-snug text-left">
                {work.title}
              </DialogTitle>
              <p className="text-sm text-muted-foreground text-left">By {work.author_name}</p>
            </DialogHeader>

            {work.abstract && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Abstract</p>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{work.abstract}</p>
              </div>
            )}

            {work.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {work.tags.map((tag) => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {(work.link_url || work.file_url) && (
              <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
                {work.link_url && (
                  <Button asChild size="sm">
                    <a href={work.link_url} target="_blank" rel="noopener noreferrer">
                      View publication
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </Button>
                )}
                {work.file_url && (
                  <Button asChild variant="outline" size="sm">
                    <a href={work.file_url} target="_blank" rel="noopener noreferrer" download>
                      Download file
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </Button>
                )}
              </div>
            )}

            {!work.link_url && !work.file_url && (
              <p className="text-xs text-muted-foreground italic">No external link or file attached.</p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ResearchPage() {
  const { data: lecturers = [], isLoading: lecturersLoading } = useLecturers();
  const { data: works = [], isLoading: worksLoading } = usePublishedResearchWorks();
  const { toast } = useToast();

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [selectedWork, setSelectedWork] = useState<PublicResearchWork | null>(null);

  // Submission form state
  const [subTitle, setSubTitle] = useState("");
  const [subAuthor, setSubAuthor] = useState("");
  const [subAuthorType, setSubAuthorType] = useState("student");
  const [subCategory, setSubCategory] = useState("Paper");
  const [subAbstract, setSubAbstract] = useState("");
  const [subYear, setSubYear] = useState(String(new Date().getFullYear()));
  const [subLinkUrl, setSubLinkUrl] = useState("");
  const [subTags, setSubTags] = useState("");
  const [subFile, setSubFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filtered = selectedCategory === "All"
    ? works
    : works.filter((w) => w.category === selectedCategory);

  const displayWorks = sortWorks(filtered, sortBy);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSubmitting(true);
    let fileUrl: string | null = null;
    if (subFile) {
      const ext = subFile.name.split(".").pop() || "pdf";
      const path = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("research-files")
        .upload(path, subFile, { upsert: false });
      if (upErr) {
        setSubmitting(false);
        toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
        return;
      }
      fileUrl = supabase.storage.from("research-files").getPublicUrl(path).data.publicUrl;
    }

    const tagList = subTags.split(",").map((t) => t.trim()).filter(Boolean);
    const { error } = await supabase.from("research_works").insert({
      title: subTitle.trim(),
      author_name: subAuthor.trim(),
      author_type: subAuthorType,
      category: subCategory,
      abstract: subAbstract.trim() || null,
      year: subYear ? parseInt(subYear, 10) : null,
      link_url: subLinkUrl.trim() || null,
      file_url: fileUrl,
      tags: tagList,
      is_published: false,
    });

    setSubmitting(false);
    if (error) {
      toast({ title: "Submission failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Submitted for review",
      description: "Your work will appear here once approved by the team.",
    });
    setSubTitle(""); setSubAuthor(""); setSubAbstract("");
    setSubLinkUrl(""); setSubTags(""); setSubFile(null);
  };

  return (
    <div className="overflow-hidden">
      <WorkDetailDialog work={selectedWork} onClose={() => setSelectedWork(null)} />

      {/* Hero */}
      <section className="relative py-20 md:py-28 bg-gradient-nature">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="font-display text-4xl md:text-5xl font-bold text-primary-foreground mb-6 animate-fade-up">
              Research Hub
            </h1>
            <p className="text-xl text-primary-foreground/90 animate-fade-up delay-100">
              Meet the faculty of Animal Biology and Conservation Science, and browse work produced by students and
              researchers in the department — papers, theses, projects, and more.
            </p>
          </div>
        </div>
      </section>

      {/* Faculty — compact horizontal cards */}
      <section className="py-14 md:py-18">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center gap-3 mb-8">
            <BookOpen className="w-7 h-7 text-primary" />
            <div>
              <h2 className="font-display text-2xl font-bold text-foreground">Our lecturers</h2>
              <p className="text-muted-foreground text-sm mt-0.5">
                Academic staff of the Department of Animal Biology and Conservation Science.
              </p>
            </div>
          </div>

          {lecturersLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-4 card-nature rounded-xl animate-pulse h-20 bg-muted/50" />
              ))}
            </div>
          ) : lecturers.length === 0 ? (
            <p className="text-muted-foreground text-sm">Faculty profiles not yet available.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {lecturers.map((lecturer) => (
                <div
                  key={lecturer.id}
                  className="flex gap-3 p-4 card-nature rounded-xl items-start"
                >
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center shrink-0 ring-1 ring-border">
                    {lecturer.image_url ? (
                      <img
                        src={lecturer.image_url}
                        alt={lecturer.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-base font-bold text-primary/40 font-display">
                        {lecturer.name.charAt(0)}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-foreground leading-snug">{lecturer.name}</p>
                    {lecturer.bio && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                        {lecturer.bio}
                      </p>
                    )}
                    {lecturer.research_interests.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {lecturer.research_interests.slice(0, 3).map((interest) => (
                          <span
                            key={interest}
                            className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary leading-none"
                          >
                            {interest}
                          </span>
                        ))}
                        {lecturer.research_interests.length > 3 && (
                          <span className="text-[10px] text-muted-foreground leading-none self-center">
                            +{lecturer.research_interests.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    {lecturer.email && (
                      <a
                        href={`mailto:${lecturer.email}`}
                        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors mt-1.5"
                      >
                        <Mail className="w-3 h-3" />
                        {lecturer.email}
                      </a>
                    )}
                    {lecturer.links && lecturer.links.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {lecturer.links.map((link) => (
                          <a
                            key={link.url}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {link.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Student / researcher works */}
      {isSupabaseConfigured && (
        <section className="py-14 md:py-18 bg-muted/40 border-y border-border">
          <div className="container mx-auto px-4 lg:px-8">
            {/* Header row */}
            <div className="flex items-center gap-3 mb-6">
              <FileText className="w-7 h-7 text-primary" />
              <div>
                <h2 className="font-display text-2xl font-bold text-foreground">Student work</h2>
                <p className="text-muted-foreground text-sm mt-0.5">
                  Papers, theses, and projects from ABCOSSA members and graduates.
                </p>
              </div>
            </div>

            {/* Filter + Sort controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
              <div className="flex flex-wrap gap-1.5">
                {["All", ...CATEGORIES].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      selectedCategory === cat
                        ? "bg-primary text-primary-foreground"
                        : "bg-background border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/20"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                  <SelectTrigger className="h-8 text-xs w-36 gap-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                    <SelectItem value="az">A → Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {worksLoading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="card-nature rounded-2xl p-6 animate-pulse h-40 bg-muted/50" />
                ))}
              </div>
            ) : displayWorks.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {selectedCategory === "All"
                  ? "No work published yet — be the first to submit below."
                  : `No ${selectedCategory.toLowerCase()} submissions yet.`}
              </p>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {displayWorks.map((work) => (
                  <button
                    key={work.id}
                    type="button"
                    onClick={() => setSelectedWork(work)}
                    className="card-nature rounded-2xl p-5 flex flex-col gap-2.5 text-left group hover:shadow-elevated transition-all duration-300 cursor-pointer w-full"
                  >
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        {work.category}
                      </span>
                      {work.year && (
                        <span className="text-xs text-muted-foreground">{work.year}</span>
                      )}
                    </div>

                    <h3 className="font-display font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">
                      {work.title}
                    </h3>

                    <p className="text-xs text-muted-foreground">
                      By {work.author_name}
                      <span className="ml-1 capitalize opacity-70">· {work.author_type.replace("-", " ")}</span>
                    </p>

                    {work.abstract && (
                      <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed flex-1">
                        {work.abstract}
                      </p>
                    )}

                    {work.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {work.tags.map((tag) => (
                          <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3 mt-auto pt-1">
                      <span className="text-xs font-medium text-primary group-hover:underline">
                        View details
                      </span>
                      {work.link_url && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <ExternalLink className="w-3 h-3" /> Link
                        </span>
                      )}
                      {work.file_url && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Download className="w-3 h-3" /> File
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Submit your work */}
      {isSupabaseConfigured && (
        <section className="py-14 md:py-18">
          <div className="container mx-auto px-4 lg:px-8 max-w-2xl">
            <div className="flex items-center gap-3 mb-8">
              <Send className="w-6 h-6 text-primary" />
              <div>
                <h2 className="font-display text-2xl font-bold text-foreground">Share your work</h2>
                <p className="text-muted-foreground text-sm mt-0.5">
                  Submitting adds your work to a review queue. It appears here once approved.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="card-nature rounded-2xl p-6 space-y-5">
              <div>
                <Label>Title</Label>
                <Input
                  className="mt-1.5"
                  value={subTitle}
                  onChange={(e) => setSubTitle(e.target.value)}
                  required
                  placeholder="e.g. Seasonal distribution of raptors in the Volta basin"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Your name</Label>
                  <Input
                    className="mt-1.5"
                    value={subAuthor}
                    onChange={(e) => setSubAuthor(e.target.value)}
                    required
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <Label>You are a…</Label>
                  <Select value={subAuthorType} onValueChange={setSubAuthorType}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">Student</SelectItem>
                      <SelectItem value="graduate">Graduate / alumni</SelectItem>
                      <SelectItem value="lecturer">Lecturer / researcher</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Category</Label>
                  <Select value={subCategory} onValueChange={setSubCategory}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Year</Label>
                  <Input
                    className="mt-1.5"
                    type="number"
                    min={1990}
                    max={new Date().getFullYear() + 1}
                    value={subYear}
                    onChange={(e) => setSubYear(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>Abstract / summary</Label>
                <Textarea
                  className="mt-1.5 min-h-[120px]"
                  value={subAbstract}
                  onChange={(e) => setSubAbstract(e.target.value)}
                  placeholder="A brief description of the work."
                />
              </div>

              <div>
                <Label>External link (optional)</Label>
                <Input
                  className="mt-1.5"
                  type="url"
                  value={subLinkUrl}
                  onChange={(e) => setSubLinkUrl(e.target.value)}
                  placeholder="https://journal.example.com/article/..."
                />
              </div>

              <div>
                <Label>Upload file (optional)</Label>
                <Input
                  className="mt-1.5"
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx"
                  onChange={(e) => setSubFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground mt-1">PDF, Word, or PowerPoint.</p>
              </div>

              <div>
                <Label>Tags (optional, comma-separated)</Label>
                <Input
                  className="mt-1.5"
                  value={subTags}
                  onChange={(e) => setSubTags(e.target.value)}
                  placeholder="Conservation, Primates, Ghana"
                />
              </div>

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Submitting…" : "Submit for review"}
              </Button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
