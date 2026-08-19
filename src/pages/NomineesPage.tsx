import { useState } from "react";
import { Award, Download, FileText, Heart, Search, Sparkles, CheckCircle2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  useAwardCategories,
  useNominees,
  useNomineePdfs,
  useVoteNominee,
  useVotePrice,
  type NomineeRow,
} from "@/hooks/useNominees";
import { formatGHS } from "@/lib/paystackClient";
import { PaystackCheckoutModal } from "@/components/payment/PaystackCheckoutModal";

export default function NomineesPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [targetNominee, setTargetNominee] = useState<NomineeRow | null>(null);
  const [voteCount, setVoteCount] = useState<number>(1);

  const { data: categories = [], isLoading: loadingCategories } = useAwardCategories();
  const { data: nominees = [], isLoading: loadingNominees } = useNominees();
  const { data: pdfDocs = [] } = useNomineePdfs();
  const { data: votePrice = 1.0 } = useVotePrice();

  const voteMutation = useVoteNominee();

  const handleFreeVote = (nomineeId: string, currentVotes: number) => {
    voteMutation.mutate(
      { nomineeId, currentVotes, voteIncrement: 1 },
      {
        onSuccess: () => {
          toast.success("Thank you for your vote!");
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Voting failed. Please try again.");
        },
      }
    );
  };

  const handlePaidVoteSuccess = (nomineeId: string, currentVotes: number, votesToAdd: number) => {
    voteMutation.mutate(
      { nomineeId, currentVotes, voteIncrement: votesToAdd },
      {
        onSuccess: () => {
          toast.success(`Successfully added ${votesToAdd} vote(s)! Thank you for supporting ABCOSSA awards.`);
          setTargetNominee(null);
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Failed to record votes");
        },
      }
    );
  };

  const filteredNominees = nominees.filter((n) => {
    const matchesCategory = selectedCategory === "all" || n.category_id === selectedCategory;
    const matchesSearch =
      n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (n.department && n.department.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (n.bio && n.bio.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen pt-28 pb-20 bg-gradient-to-b from-background via-background/95 to-muted/30">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Header Hero */}
        <div className="max-w-4xl mx-auto text-center mb-12 space-y-4">
          <Badge variant="outline" className="px-3.5 py-1 text-sm border-primary/30 text-primary bg-primary/5 rounded-full inline-flex items-center gap-1.5 font-semibold">
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" /> ABCOSSA Excellence Awards
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Nominees & Recognition
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Discover outstanding students, researchers, and student leaders nominated for ABCOSSA awards.
            Cast your votes and download official PDF nominee lists.
          </p>

          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
            <span>Voting Price: {votePrice === 0 ? "Free" : `${formatGHS(votePrice)} / vote`}</span>
          </div>
        </div>

        {/* PDF Documents Section */}
        {pdfDocs.length > 0 && (
          <div className="max-w-6xl mx-auto mb-14">
            <Card className="border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
              <CardHeader className="bg-muted/40 border-b border-border/40 pb-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    <CardTitle className="text-xl font-bold">Official PDF Nominee Lists</CardTitle>
                  </div>
                  <Badge variant="secondary">{pdfDocs.length} Document{pdfDocs.length > 1 ? "s" : ""}</Badge>
                </div>
                <CardDescription>
                  Download complete, verified PDF documents of nominees released by the ABCOSSA Executive Board.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pdfDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-start justify-between p-4 rounded-xl border border-border/60 bg-background/80 hover:bg-muted/40 transition-all hover:shadow-md"
                    >
                      <div className="space-y-1.5 max-w-[75%]">
                        <h4 className="font-semibold text-foreground text-sm line-clamp-1">{doc.title}</h4>
                        <p className="text-xs text-muted-foreground line-clamp-1">{doc.filename}</p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1">
                          <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                          {doc.parsed_count > 0 && <span>• {doc.parsed_count} candidates</span>}
                        </div>
                      </div>
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline bg-primary/10 hover:bg-primary/20 px-3 py-2 rounded-lg transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> PDF
                      </a>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filter Controls */}
        <div className="max-w-6xl mx-auto space-y-6 mb-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full md:w-auto">
              <TabsList className="flex flex-wrap h-auto p-1 bg-muted/60">
                <TabsTrigger value="all" className="rounded-md text-xs sm:text-sm">
                  All Categories
                </TabsTrigger>
                {categories.map((cat) => (
                  <TabsTrigger key={cat.id} value={cat.id} className="rounded-md text-xs sm:text-sm">
                    {cat.title}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search nominee by name, dept..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-card/70 border-border/60"
              />
            </div>
          </div>
        </div>

        {/* Nominees Grid */}
        <div className="max-w-6xl mx-auto">
          {loadingNominees || loadingCategories ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-64 rounded-2xl bg-muted/50 animate-pulse border border-border/40" />
              ))}
            </div>
          ) : filteredNominees.length === 0 ? (
            <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-border bg-card/40">
              <Award className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-60" />
              <h3 className="text-lg font-semibold text-foreground">No Nominees Found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                {searchQuery
                  ? "No candidate matches your search terms. Try clearing the filter."
                  : "No published nominees are available in this category yet."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredNominees.map((nominee) => {
                const categoryObj = categories.find((c) => c.id === nominee.category_id);

                return (
                  <Card
                    key={nominee.id}
                    className="group border border-border/60 bg-card hover:border-primary/40 hover:shadow-lg transition-all duration-300 flex flex-col justify-between overflow-hidden"
                  >
                    <div>
                      <div className="h-2 bg-gradient-to-r from-emerald-500 via-primary to-teal-500" />
                      <CardHeader className="pt-5 pb-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          {categoryObj ? (
                            <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">
                              {categoryObj.title}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">General Nominee</Badge>
                          )}
                          {nominee.level && (
                            <Badge variant="secondary" className="text-[11px]">
                              {nominee.level}
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                          {nominee.name}
                        </CardTitle>
                        {nominee.department && (
                          <CardDescription className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            {nominee.department}
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        {nominee.bio && (
                          <p className="text-sm text-muted-foreground line-clamp-4 leading-relaxed">
                            {nominee.bio}
                          </p>
                        )}
                      </CardContent>
                    </div>

                    <div className="p-6 pt-0 mt-4 border-t border-border/40 pt-4 flex items-center justify-between bg-muted/20">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                        <Heart className="w-4 h-4 text-rose-500 fill-rose-500/20" />
                        <span className="font-bold text-foreground">{nominee.votes_count}</span>
                        <span>{nominee.votes_count === 1 ? "Vote" : "Votes"}</span>
                      </div>

                      {votePrice === 0 ? (
                        <Button
                          size="sm"
                          disabled={voteMutation.isPending}
                          onClick={() => handleFreeVote(nominee.id, nominee.votes_count)}
                          className="rounded-lg gap-1.5 text-xs font-semibold"
                        >
                          <Heart className="w-3.5 h-3.5" /> Free Vote
                        </Button>
                      ) : (
                        <PaystackCheckoutModal
                          title={`Vote for ${nominee.name}`}
                          defaultAmount={votePrice * voteCount}
                          paymentType="voting"
                          metadata={{ nominee_id: nominee.id, votes_count: voteCount }}
                          onSuccess={() => handlePaidVoteSuccess(nominee.id, nominee.votes_count, voteCount)}
                          trigger={
                            <Button
                              size="sm"
                              className="rounded-lg gap-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
                            >
                              <Heart className="w-3.5 h-3.5" /> Vote ({formatGHS(votePrice)})
                            </Button>
                          }
                        />
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
