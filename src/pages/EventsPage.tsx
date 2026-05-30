import { Link } from "react-router-dom";
import { ArrowRight, Calendar, ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  GOOGLE_CALENDAR_EMBED_SRC,
  SUGGESTION_FORM_URL,
} from "@/config/site";
import { usePublicEvents } from "@/hooks/useSupabasePublic";
import { isSupabaseConfigured } from "@/integrations/supabase/client";

function formatRange(starts: string, ends: string | null) {
  try {
    const s = new Date(starts);
    const opts: Intl.DateTimeFormatOptions = {
      dateStyle: "medium",
      timeStyle: "short",
    };
    if (!ends) return new Intl.DateTimeFormat(undefined, opts).format(s);
    const e = new Date(ends);
    return `${new Intl.DateTimeFormat(undefined, opts).format(s)} – ${new Intl.DateTimeFormat(undefined, {
      timeStyle: "short",
    }).format(e)}`;
  } catch {
    return starts;
  }
}

export default function EventsPage() {
  const hasCalendar = Boolean(GOOGLE_CALENDAR_EMBED_SRC);
  const { data: dbEvents = [], isLoading: eventsLoading } = usePublicEvents();
  const showListed = isSupabaseConfigured;

  return (
    <div className="overflow-hidden">
      <section className="relative py-20 md:py-28 bg-gradient-nature">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="font-display text-4xl md:text-5xl font-bold text-primary-foreground mb-6 animate-fade-up">
              Events & Workshops
            </h1>
            <p className="text-xl text-primary-foreground/90 animate-fade-up delay-100">
              See what&apos;s happening in and around the department — from field days and workshops to talks and community
              events. Stay in the loop on everything ABCOSSA.
            </p>
          </div>
        </div>
      </section>


      {showListed && (
        <section className="py-16 md:py-20 border-b border-border bg-secondary/20">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="flex items-center gap-3 mb-8">
              <Calendar className="w-8 h-8 text-primary" />
              <div>
                <h2 className="font-display text-3xl font-bold text-foreground">Upcoming &amp; featured</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Events published by the team. The calendar below may include additional department items.
                </p>
              </div>
            </div>
            {eventsLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2].map((i) => (
                  <div key={i} className="card-nature rounded-2xl p-6 animate-pulse h-32 bg-muted/50" />
                ))}
              </div>
            ) : dbEvents.length === 0 ? (
              <p className="text-muted-foreground text-sm">No listed events yet.</p>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {dbEvents.map((ev) => (
                  <li key={ev.id} className="card-nature rounded-2xl border border-border overflow-hidden">
                    {ev.cover_image_url && (
                      <img src={ev.cover_image_url} alt={ev.title} className="w-full h-40 object-cover" />
                    )}
                    <div className="p-6">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-display text-lg font-semibold text-foreground">{ev.title}</h3>
                      {ev.featured && (
                        <span className="shrink-0 text-xs font-medium px-2 py-1 rounded-full bg-accent/20 text-accent">
                          Featured
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-primary font-medium mb-2">{ev.event_type}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4 shrink-0" />
                      {formatRange(ev.starts_at, ev.ends_at)}
                    </p>
                    {ev.location && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2 mb-2">
                        <MapPin className="w-4 h-4 shrink-0" />
                        {ev.location}
                      </p>
                    )}
                    {ev.description && (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-3">{ev.description}</p>
                    )}
                    {ev.register_url && (
                      <a
                        href={ev.register_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        Details / register <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center gap-3 mb-8">
            <Calendar className="w-8 h-8 text-primary" />
            <div>
              <h2 className="font-display text-3xl font-bold text-foreground">Department calendar</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Switch views and click events for full details, location, and links added by organizers.
              </p>
            </div>
          </div>

          <div className="card-nature rounded-2xl overflow-hidden border border-border shadow-elevated">
            {hasCalendar ? (
              <iframe
                title="ABCOSSA and department events calendar"
                src={GOOGLE_CALENDAR_EMBED_SRC}
                className="w-full border-0 min-h-[560px] md:min-h-[640px] lg:min-h-[720px]"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="min-h-[400px] flex items-center justify-center bg-muted/30 p-8">
                <div className="text-center max-w-md">
                  <Calendar className="w-14 h-14 text-muted-foreground mx-auto mb-4 opacity-60" />
                  <p className="text-muted-foreground">
                    Calendar preview will appear here once <code className="text-xs bg-muted px-1 rounded">VITE_GOOGLE_CALENDAR_EMBED_URL</code> is
                    set.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>


      <section className="py-20 bg-gradient-hero">
        <div className="container mx-auto px-4 lg:px-8 text-center">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
            Have a question?
          </h2>
          <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto mb-8">
            Reach out through the contact page — we&apos;re always happy to help.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="hero" size="lg" asChild>
              <Link to="/contact">
                Contact us
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
            <Button variant="hero-outline" size="lg" asChild>
              <a href={SUGGESTION_FORM_URL} target="_blank" rel="noopener noreferrer">
                Share a suggestion
              </a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
