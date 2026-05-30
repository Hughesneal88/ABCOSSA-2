import { Link } from "react-router-dom";
import {
  ArrowRight,
  Briefcase,
  Building2,
  CalendarDays,
  Loader2,
  MapPin,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInternships } from "@/hooks/useInternships";
import { format, parseISO, isValid } from "date-fns";

function formatDeadline(value: string | undefined) {
  if (!value?.trim()) return null;
  const d = parseISO(value);
  if (!isValid(d)) return value;
  return format(d, "MMM d, yyyy");
}

export default function InternshipsPage() {
  const { data: internships = [], isLoading, isError, error, refetch } = useInternships();

  return (
    <div className="overflow-hidden">
      <section className="relative py-20 md:py-28 bg-gradient-nature">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="font-display text-4xl md:text-5xl font-bold text-primary-foreground mb-6 animate-fade-up">
              Internships
            </h1>
            <p className="text-xl text-primary-foreground/90 animate-fade-up delay-100">
              Opportunities shared with ABCOSSA members—placements, attachments, and summer roles in conservation and
              animal biology. Listings update whenever the data source is refreshed.
            </p>
          </div>
        </div>
      </section>


      <section className="py-20">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center gap-3 mb-10">
            <Briefcase className="w-9 h-9 text-primary" />
            <div>
              <h2 className="font-display text-3xl font-bold text-foreground">Current postings</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Each card includes how to apply when a link is provided.
              </p>
            </div>
          </div>

          {isLoading && (
            <div className="flex justify-center py-20">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          )}

          {isError && (
            <div className="card-nature p-6 rounded-2xl border-destructive/30 bg-destructive/5 flex gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <div>
                <p className="text-destructive font-medium">Could not load listings</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {error instanceof Error ? error.message : "Unknown error"}
                </p>
                <Button variant="outline" size="sm" className="mt-4" type="button" onClick={() => refetch()}>
                  Try again
                </Button>
              </div>
            </div>
          )}

          {!isLoading && !isError && internships.length === 0 && (
            <p className="text-muted-foreground text-center py-16">
              No internships listed yet. Add entries to your JSON source to show them here.
            </p>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {!isLoading &&
              !isError &&
              internships.map((job, index) => (
                <article
                  key={`${job.title}-${job.organization}-${index}`}
                  className="card-nature rounded-2xl hover:shadow-elevated transition-all duration-300 animate-fade-up border border-border/80 overflow-hidden"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  {job.coverImageUrl && (
                    <img
                      src={job.coverImageUrl}
                      alt={`${job.organization} cover`}
                      className="w-full h-40 object-cover"
                    />
                  )}
                  <div className="p-6">
                    <div className="flex flex-wrap gap-2 mb-3">
                      {job.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h3 className="font-display text-xl font-semibold text-foreground mb-2">{job.title}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-4">
                      <span className="inline-flex items-center gap-1.5">
                        {job.logoUrl
                          ? <img src={job.logoUrl} alt={`${job.organization} logo`} className="w-4 h-4 rounded object-contain shrink-0" />
                          : <Building2 className="w-4 h-4 shrink-0" />}
                        {job.organization}
                      </span>
                      {job.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 shrink-0" />
                          {job.location}
                        </span>
                      )}
                      {job.timeframe && (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="w-4 h-4 shrink-0" />
                          {job.timeframe}
                        </span>
                      )}
                    </div>
                    {formatDeadline(job.deadline) && (
                      <p className="text-xs font-medium text-accent mb-3">Apply by {formatDeadline(job.deadline)}</p>
                    )}
                    <p className="text-muted-foreground text-sm leading-relaxed mb-5">{job.description}</p>
                    {job.applyUrl ? (
                      <Button variant="default" size="sm" asChild>
                        <a href={job.applyUrl} target="_blank" rel="noopener noreferrer">
                          Apply or learn more
                          <ArrowRight className="w-4 h-4" />
                        </a>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/contact">
                          Ask ABCOSSA about this role
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </article>
              ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-muted/40 border-t border-border">
        <div className="container mx-auto px-4 lg:px-8 text-center max-w-2xl">
          <p className="text-muted-foreground mb-6">
            Want a role listed here? Email the executive committee or use the contact form with details and an application
            link.
          </p>
          <Button variant="hero" size="lg" asChild>
            <Link to="/contact">
              Contact us
              <ArrowRight className="w-5 h-5" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
