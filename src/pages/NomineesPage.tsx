import { useState, useMemo, useEffect } from "react";
import {
  Award,
  Heart,
  Search,
  Sparkles,
  PhoneCall,
  Smartphone,
  ArrowUpDown,
  ArrowLeft,
  Trophy,
  X as XIcon,
  RotateCcw,
  Crown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  useAwardCategories,
  useNominees,
  useVoteNominee,
  useVotePrice,
  useUssdSettings,
  ensureDinnerAwardsData,
} from "@/hooks/useNominees";
import { useQueryClient } from "@tanstack/react-query";
import { formatGHS } from "@/lib/paystackClient";
import { PaystackCheckoutModal } from "@/components/payment/PaystackCheckoutModal";
import { UssdInstructionsModal } from "@/components/voting/UssdInstructionsModal";

export default function NomineesPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("votes_desc");
  const [showAllLeaderboards, setShowAllLeaderboards] = useState<boolean>(false);

  const { data: categories = [], isLoading: loadingCategories } = useAwardCategories();
  const { data: nominees = [], isLoading: loadingNominees } = useNominees();
  const { data: votePrice = 1.0 } = useVotePrice();
  const { data: ussdSettings } = useUssdSettings();

  const voteMutation = useVoteNominee();
  const queryClient = useQueryClient();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "ABCOSSA Dinner Awards";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    ensureDinnerAwardsData()
      .then((changed) => {
        if (!cancelled && changed) {
          queryClient.invalidateQueries({ queryKey: ["award-categories"] });
          queryClient.invalidateQueries({ queryKey: ["nominees"] });
        }
      })
      .catch(() => {
        // Seed is best-effort; voting still works if it cannot run.
      });
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

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
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Failed to record votes");
        },
      }
    );
  };

  // Category counts map
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    nominees.forEach((n) => {
      const key = n.category_id || "none";
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [nominees]);

  // Category-specific rank map for every nominee
  const categoryRankings = useMemo(() => {
    const grouped: Record<string, typeof nominees> = {};
    nominees.forEach((n) => {
      const key = n.category_id || "none";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(n);
    });

    const rankMap: Record<
      string,
      { rank: number; total: number; isLeader: boolean; categoryTitle: string }
    > = {};

    Object.entries(grouped).forEach(([catId, list]) => {
      const catObj = categories.find((c) => c.id === catId);
      const catTitle = catObj?.title || (catId === "none" ? "General Nominees" : "Category");

      const sorted = [...list].sort((a, b) => {
        const diff = (b.votes_count || 0) - (a.votes_count || 0);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });

      sorted.forEach((n, idx) => {
        rankMap[n.id] = {
          rank: idx + 1,
          total: sorted.length,
          isLeader: idx === 0 && (n.votes_count || 0) > 0,
          categoryTitle: catTitle,
        };
      });
    });

    return rankMap;
  }, [nominees, categories]);

  // Category-specific leaderboards summary
  const categoryLeaderboards = useMemo(() => {
    return categories.map((cat) => {
      const inCat = nominees.filter((n) => n.category_id === cat.id);
      const sorted = [...inCat].sort((a, b) => (b.votes_count || 0) - (a.votes_count || 0));
      const leader = sorted[0];
      return {
        category: cat,
        nominees: sorted,
        totalNominees: inCat.length,
        totalVotes: inCat.reduce((sum, n) => sum + (n.votes_count || 0), 0),
        leader: leader && (leader.votes_count || 0) > 0 ? leader : null,
        runnerUp: sorted[1] && (sorted[1].votes_count || 0) > 0 ? sorted[1] : null,
      };
    });
  }, [categories, nominees]);

  // Filtered and sorted nominees
  const filteredAndSortedNominees = useMemo(() => {
    let list = [...nominees];

    // 1. Category Filter
    if (selectedCategory !== "all") {
      if (selectedCategory === "none") {
        list = list.filter((n) => !n.category_id);
      } else {
        list = list.filter((n) => n.category_id === selectedCategory);
      }
    }

    // 2. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((n) => {
        const cat = categories.find((c) => c.id === n.category_id);
        return (
          n.name.toLowerCase().includes(q) ||
          (n.nominee_code && n.nominee_code.toLowerCase().includes(q)) ||
          (n.department && n.department.toLowerCase().includes(q)) ||
          (n.level && n.level.toLowerCase().includes(q)) ||
          (n.bio && n.bio.toLowerCase().includes(q)) ||
          (cat && cat.title.toLowerCase().includes(q))
        );
      });
    }

    // 3. Sorting
    list.sort((a, b) => {
      if (sortBy === "votes_desc") {
        return (b.votes_count || 0) - (a.votes_count || 0);
      }
      if (sortBy === "votes_asc") {
        return (a.votes_count || 0) - (b.votes_count || 0);
      }
      if (sortBy === "name_asc") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
      if (sortBy === "name_desc") {
        return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
      }
      if (sortBy === "category_asc") {
        const catA = categories.find((c) => c.id === a.category_id)?.title || "Uncategorized";
        const catB = categories.find((c) => c.id === b.category_id)?.title || "Uncategorized";
        const cmp = catA.localeCompare(catB, undefined, { sensitivity: "base" });
        if (cmp !== 0) return cmp;
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "code_asc") {
        const codeA = parseInt(a.nominee_code || "999999", 10);
        const codeB = parseInt(b.nominee_code || "999999", 10);
        if (!isNaN(codeA) && !isNaN(codeB)) return codeA - codeB;
        return (a.nominee_code || "").localeCompare(b.nominee_code || "");
      }
      if (sortBy === "code_desc") {
        const codeA = parseInt(a.nominee_code || "0", 10);
        const codeB = parseInt(b.nominee_code || "0", 10);
        if (!isNaN(codeA) && !isNaN(codeB)) return codeB - codeA;
        return (b.nominee_code || "").localeCompare(a.nominee_code || "");
      }
      if (sortBy === "created_desc") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === "created_asc") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return 0;
    });

    return list;
  }, [nominees, categories, selectedCategory, searchQuery, sortBy]);

  const ussdShortcode = ussdSettings?.shortcode || "*928*667#";
  const ussdEnabled = Boolean(ussdSettings?.enabled);

  const isFiltered = Boolean(selectedCategory !== "all" || searchQuery.trim() || sortBy !== "votes_desc");
  const hasSearched = Boolean(searchQuery.trim().length > 0 || selectedCategory !== "all");

  const handleResetFilters = () => {
    setSelectedCategory("all");
    setSearchQuery("");
    setSortBy("votes_desc");
  };

  const selectedCategoryObj = categories.find((c) => c.id === selectedCategory);

  // Filter category leaderboards to only show categories matching the search or selected category
  const matchingCategoryLeaderboards = useMemo(() => {
    if (!hasSearched) return [];

    return categoryLeaderboards.filter(({ category, nominees: catNominees }) => {
      if (selectedCategory !== "all") {
        if (category.id !== selectedCategory) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const catMatches =
          category.title.toLowerCase().includes(q) ||
          (category.description && category.description.toLowerCase().includes(q));
        const hasMatchingNominee = catNominees.some(
          (n) =>
            n.name.toLowerCase().includes(q) ||
            (n.nominee_code && n.nominee_code.toLowerCase().includes(q)) ||
            (n.department && n.department.toLowerCase().includes(q)) ||
            (n.level && n.level.toLowerCase().includes(q)) ||
            (n.bio && n.bio.toLowerCase().includes(q))
        );
        return catMatches || hasMatchingNominee;
      }

      return true;
    });
  }, [hasSearched, selectedCategory, searchQuery, categoryLeaderboards]);

  return (
    <div className="min-h-screen pt-28 pb-20 bg-gradient-to-b from-background via-background/95 to-muted/30">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Header Hero */}
        <div className="max-w-4xl mx-auto text-center mb-8 space-y-4">
          <Badge variant="outline" className="px-3.5 py-1 text-sm border-primary/30 text-primary bg-primary/5 rounded-full inline-flex items-center gap-1.5 font-semibold">
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" /> Vote now
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            ABCOSSA Dinner Awards
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Discover outstanding students, researchers, and student leaders nominated for the ABCOSSA Dinner Awards.
            Cast your votes online{ussdEnabled ? " or via USSD shortcode" : ""}.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              <span>Voting Price: {votePrice === 0 ? "Free" : `${formatGHS(votePrice)} / vote`}</span>
            </div>

            {ussdEnabled && (
              <UssdInstructionsModal
                trigger={
                  <button type="button" className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors text-xs font-semibold cursor-pointer">
                    <Smartphone className="w-3.5 h-3.5 text-primary" />
                    <span>USSD Voting: Dial {ussdShortcode}</span>
                  </button>
                }
              />
            )}
          </div>
        </div>

        {/* USSD Promo Banner (When USSD is Enabled) */}
        {ussdEnabled && (
          <div className="max-w-6xl mx-auto mb-8">
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-primary/10 to-teal-500/10 border border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <PhoneCall className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                    Vote via Mobile USSD Code
                    <Badge variant="secondary" className="text-[10px] px-2 py-0.5">MTN • Telecel • AT</Badge>
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    No internet required. Dial <strong className="text-foreground">{ussdShortcode}</strong> and enter candidate&apos;s 3-digit code to vote instantly.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <UssdInstructionsModal
                  trigger={
                    <Button size="sm" variant="outline" className="text-xs font-semibold w-full sm:w-auto gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      View USSD Guide
                    </Button>
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* 1. Primary Search Bar & Filter Toolbar (comes BEFORE categories) */}
        <div className="max-w-6xl mx-auto space-y-3 mb-8">
          <div className="p-2 sm:p-2.5 rounded-2xl bg-card border border-border/60 shadow-sm flex flex-col md:flex-row items-center gap-2.5">
            {/* Expanded Prominent Search Bar */}
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search nominees by name, code #101, department, or award category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-9 text-xs sm:text-sm h-11 bg-background/80 border-border/60 rounded-xl focus-visible:ring-primary/30"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Category Dropdown */}
            <div className="w-full md:w-56 flex-shrink-0">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="text-xs sm:text-sm h-11 bg-background/80 border-border/60 rounded-xl font-medium">
                  <div className="flex items-center gap-2 truncate">
                    <Award className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="truncate">
                      {selectedCategory === "all" ? "Select Category" : selectedCategoryObj?.title || "Category"}
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">All Categories ({nominees.length})</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.title} ({categoryCounts[cat.id] || 0})
                    </SelectItem>
                  ))}
                  {categoryCounts["none"] > 0 && (
                    <SelectItem value="none">Uncategorized ({categoryCounts["none"]})</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Sort Dropdown */}
            <div className="w-full md:w-48 flex-shrink-0 flex items-center gap-2">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="text-xs sm:text-sm h-11 bg-background/80 border-border/60 rounded-xl font-medium flex-1">
                  <div className="flex items-center gap-2 truncate">
                    <ArrowUpDown className="w-4 h-4 text-primary flex-shrink-0" />
                    <SelectValue placeholder="Sort By" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="votes_desc">Votes: High to Low</SelectItem>
                  <SelectItem value="votes_asc">Votes: Low to High</SelectItem>
                  <SelectItem value="name_asc">Name: A to Z</SelectItem>
                  <SelectItem value="name_desc">Name: Z to A</SelectItem>
                  <SelectItem value="category_asc">Category: A to Z</SelectItem>
                  <SelectItem value="code_asc">USSD Code (101...)</SelectItem>
                  <SelectItem value="created_desc">Recently Added</SelectItem>
                </SelectContent>
              </Select>

              {isFiltered && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Reset Filters"
                  onClick={handleResetFilters}
                  className="h-11 w-11 rounded-xl text-muted-foreground hover:text-destructive flex-shrink-0"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Results Summary Bar */}
          {hasSearched && (
            <div className="flex items-center justify-between flex-wrap gap-2 px-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 flex-wrap">
                <span>
                  Found <strong className="text-foreground font-bold">{filteredAndSortedNominees.length}</strong> matching candidate{filteredAndSortedNominees.length === 1 ? "" : "s"}
                </span>
                {selectedCategory !== "all" && selectedCategoryObj && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold text-[11px] border border-primary/20">
                    {selectedCategoryObj.title}
                    <button
                      type="button"
                      onClick={() => setSelectedCategory("all")}
                      className="hover:text-primary-foreground hover:bg-primary rounded-full p-0.5 transition-colors"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {searchQuery && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-muted text-foreground font-semibold text-[11px] border border-border/60">
                    &ldquo;{searchQuery}&rdquo;
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="hover:text-destructive rounded-full p-0.5 transition-colors"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>

              <div className="text-[11px] font-medium hidden sm:block">
                Sorted by:{" "}
                <strong className="text-foreground">
                  {sortBy === "votes_desc"
                    ? "Votes (High to Low)"
                    : sortBy === "votes_asc"
                    ? "Votes (Low to High)"
                    : sortBy === "name_asc"
                    ? "Name (A to Z)"
                    : sortBy === "name_desc"
                    ? "Name (Z to A)"
                    : sortBy === "category_asc"
                    ? "Category (A to Z)"
                    : sortBy === "code_asc"
                    ? "Candidate Code"
                    : "Recently Added"}
                </strong>
              </div>
            </div>
          )}
        </div>

        {/* View 1: Award Categories Grid (Default view when no category/search is selected) */}
        {!hasSearched ? (
          <div className="max-w-6xl mx-auto mb-12 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                  <Award className="w-5 h-5 text-primary" />
                  Award Categories ({categoryLeaderboards.length})
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  Select an award category below to view nominees and cast your votes.
                </p>
              </div>
            </div>

            {loadingCategories ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-40 rounded-2xl bg-muted/50 animate-pulse border border-border/40" />
                ))}
              </div>
            ) : categoryLeaderboards.length === 0 ? (
              <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-border bg-card/40 space-y-3">
                <Award className="w-12 h-12 text-muted-foreground mx-auto opacity-60" />
                <h3 className="text-lg font-semibold text-foreground">No Categories Available</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Award categories are currently being updated. Please check back soon.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryLeaderboards.map(({ category, leader, totalNominees, totalVotes }) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(category.id);
                      window.scrollTo({ top: 380, behavior: "smooth" });
                    }}
                    className="p-5 rounded-2xl border border-border/70 bg-card hover:border-primary/60 hover:shadow-md hover:bg-card/90 transition-all duration-200 text-left flex flex-col justify-between group relative overflow-hidden cursor-pointer"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="text-[11px] font-semibold bg-primary/5 border-primary/20 text-primary">
                          {totalNominees} {totalNominees === 1 ? "Nominee" : "Nominees"}
                        </Badge>
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                        {category.title}
                      </h3>

                      {category.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {category.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs">
                      {leader ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Crown className="w-4 h-4 text-amber-500 flex-shrink-0" />
                          <span className="text-[11px] text-muted-foreground">Leading:</span>
                          <span className="font-semibold text-foreground truncate text-[11px]">
                            {leader.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic">
                          Voting open
                        </span>
                      )}

                      <span className="text-xs font-semibold text-primary inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        View Nominees <ChevronRight className="w-4 h-4" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* View 2: Nominees in Selected Category or Search Results */
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Category Drilldown Navigation Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-border/60 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                  className="text-xs font-semibold gap-1.5 rounded-xl flex-shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> All Categories
                </Button>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2 truncate">
                    <Award className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="truncate">
                      {searchQuery
                        ? `Search: "${searchQuery}"`
                        : selectedCategoryObj
                        ? selectedCategoryObj.title
                        : "Category Nominees"}
                    </span>
                  </h2>
                  {selectedCategoryObj?.description && !searchQuery && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {selectedCategoryObj.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 text-xs">
                <Badge variant="secondary" className="text-xs font-semibold">
                  {filteredAndSortedNominees.length} {filteredAndSortedNominees.length === 1 ? "Nominee" : "Nominees"}
                </Badge>
              </div>
            </div>

            {/* Nominees Grid */}
            {loadingNominees || loadingCategories ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-64 rounded-2xl bg-muted/50 animate-pulse border border-border/40" />
                ))}
              </div>
            ) : filteredAndSortedNominees.length === 0 ? (
              <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-border bg-card/40 space-y-3">
                <Award className="w-12 h-12 text-muted-foreground mx-auto opacity-60" />
                <h3 className="text-lg font-semibold text-foreground">No Nominees Found</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  {searchQuery || selectedCategory !== "all"
                    ? "No candidate matches your current filters or search terms."
                    : "No published nominees are available in this category yet."}
                </p>
                {isFiltered && (
                  <Button type="button" variant="outline" size="sm" onClick={handleResetFilters} className="text-xs gap-1.5">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to All Categories
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredAndSortedNominees.map((nominee) => {
                const categoryObj = categories.find((c) => c.id === nominee.category_id);
                const rankInfo = categoryRankings[nominee.id];
                const catRank = rankInfo?.rank ?? 1;
                const hasVotes = (nominee.votes_count || 0) > 0;

                return (
                  <Card
                    key={nominee.id}
                    className="group border border-border/60 bg-card hover:border-primary/40 hover:shadow-lg transition-all duration-300 flex flex-col justify-between overflow-hidden"
                  >
                    <div>
                      {/* Nominee Portrait Image (if available) */}
                      {nominee.image_url ? (
                        <div className="relative h-56 w-full overflow-hidden bg-muted/40">
                          <img
                            src={nominee.image_url}
                            alt={nominee.name}
                            className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/10 to-black/30" />
                          <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
                            {/* Category Badge */}
                            <Badge variant="outline" className="text-xs bg-background/90 backdrop-blur-md text-foreground font-semibold shadow-sm border-border/80">
                              {categoryObj ? categoryObj.title : "General Nominee"}
                            </Badge>

                            {/* Category-Specific Rank Badge */}
                            <div
                              className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 shadow-md backdrop-blur-md ${
                                catRank === 1 && hasVotes
                                  ? "bg-amber-500 text-white"
                                  : catRank === 2 && hasVotes
                                  ? "bg-slate-400 text-white"
                                  : catRank === 3 && hasVotes
                                  ? "bg-amber-700 text-white"
                                  : "bg-background/90 text-foreground border border-border/60"
                              }`}
                            >
                              {catRank <= 3 && hasVotes ? (
                                <Trophy className="w-3 h-3" />
                              ) : (
                                <span>#</span>
                              )}
                              <span>
                                {hasVotes ? `#${catRank} in Category` : `#${catRank}`}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="h-2 bg-gradient-to-r from-emerald-500 via-primary to-teal-500" />
                          <div className="p-5 pb-0 flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-primary/10 to-teal-500/20 border border-primary/20 flex items-center justify-center font-bold text-sm text-primary shadow-xs flex-shrink-0">
                                {nominee.name
                                  .split(" ")
                                  .map((p) => p[0])
                                  .slice(0, 2)
                                  .join("")
                                  .toUpperCase()}
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {categoryObj ? (
                                  <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">
                                    {categoryObj.title}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">General Nominee</Badge>
                                )}
                              </div>
                            </div>

                            {/* Category-Specific Rank Badge */}
                            <div
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 shadow-sm ${
                                catRank === 1 && hasVotes
                                  ? "bg-amber-500 text-white"
                                  : catRank === 2 && hasVotes
                                  ? "bg-slate-400 text-white"
                                  : catRank === 3 && hasVotes
                                  ? "bg-amber-700 text-white"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {catRank <= 3 && hasVotes ? (
                                <Trophy className="w-3 h-3" />
                              ) : (
                                <span>#</span>
                              )}
                              <span>
                                {hasVotes ? `#${catRank} in Category` : `#${catRank}`}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      <CardHeader className={nominee.image_url ? "pt-4 pb-3" : "pt-3 pb-3"}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {nominee.nominee_code && ussdEnabled && (
                              <Badge variant="outline" className="text-[11px] font-mono font-bold bg-muted border-border/60 text-foreground">
                                Code: #{nominee.nominee_code}
                              </Badge>
                            )}
                            {nominee.level && (
                              <Badge variant="secondary" className="text-[11px]">
                                {nominee.level}
                              </Badge>
                            )}
                          </div>
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

                    <div className="p-5 pt-3 mt-4 border-t border-border/40 flex flex-col gap-3 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                          <Heart className="w-4 h-4 text-rose-500 fill-rose-500/20" />
                          <span className="font-bold text-foreground">{nominee.votes_count}</span>
                          <span>{nominee.votes_count === 1 ? "Vote" : "Votes"}</span>
                        </div>
                        {nominee.nominee_code && ussdEnabled && (
                          <span className="text-[11px] font-mono text-muted-foreground">
                            Dial: {ussdShortcode.replace(/#$/, "")}*{nominee.nominee_code}#
                          </span>
                        )}
                      </div>

                      <div className={ussdEnabled ? "grid grid-cols-2 gap-2" : "flex flex-col"}>
                        {/* Option 1: Online Vote */}
                        {votePrice === 0 ? (
                          <Button
                            size="sm"
                            disabled={voteMutation.isPending}
                            onClick={() => handleFreeVote(nominee.id, nominee.votes_count)}
                            className="rounded-lg gap-1.5 text-xs font-semibold w-full"
                          >
                            <Heart className="w-3.5 h-3.5" /> Free Vote
                          </Button>
                        ) : (
                          <PaystackCheckoutModal
                            title={`Vote for ${nominee.name}`}
                            defaultAmount={votePrice}
                            unitPrice={votePrice}
                            paymentType="voting"
                            metadata={{ nominee_id: nominee.id }}
                            onSuccess={(details) =>
                              handlePaidVoteSuccess(nominee.id, nominee.votes_count, details?.votesCount ?? 1)
                            }
                            trigger={
                              <Button
                                size="sm"
                                className="rounded-lg gap-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground w-full"
                              >
                                <Heart className="w-3.5 h-3.5" /> Vote ({formatGHS(votePrice)})
                              </Button>
                            }
                          />
                        )}

                        {/* Option 2: USSD Vote */}
                        {ussdEnabled && (
                          <UssdInstructionsModal
                            nomineeName={nominee.name}
                            nomineeCode={nominee.nominee_code}
                            categoryTitle={categoryObj?.title}
                            trigger={
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-lg gap-1.5 text-xs font-semibold w-full"
                              >
                                <PhoneCall className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                USSD
                              </Button>
                            }
                          />
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
