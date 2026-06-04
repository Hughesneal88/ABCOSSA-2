import { Link } from "react-router-dom";
import { ArrowRight, Leaf, Calendar, Lightbulb, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EVENT_PROPOSAL_URL } from "@/config/site";
import { usePublicBlogPosts, useUpcomingPublicEvents, useSiteImages } from "@/hooks/useSupabasePublic";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import heroImage from "@/assets/hero-sustaining-ecosystem.png";
import cardInternships from "@/assets/card-courtyard-plants.png";
import cardEvents from "@/assets/card-dept-hallway.png";
import cardCommunity from "@/assets/card-campus-lawn.png";
import galleryApproach from "@/assets/gallery-campus-approach.png";
import gallerySnakePlant from "@/assets/gallery-courtyard-snake-plant.png";
import galleryPalm from "@/assets/gallery-courtyard-palm.png";
import galleryEntranceAlt from "@/assets/gallery-entrance-alt.png";
import campusEntrance from "@/assets/campus-entrance-hod.png";
import abcossaIllustration from "@/assets/WhatsApp Image 2026-05-05 at 5.53.36 PM.jpeg";
import galleryNew1 from "@/assets/WhatsApp Image 2026-05-05 at 5.55.48 PM (2).jpeg";
import galleryNew2 from "@/assets/WhatsApp Image 2026-05-05 at 5.55.49 PM (2).jpeg";
import galleryNew3 from "@/assets/WhatsApp Image 2026-05-05 at 5.55.49 PM (4).jpeg";




function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function HomePage() {
  const { data: blogs = [], isLoading: blogsLoading } = usePublicBlogPosts();
  const { data: events = [], isLoading: eventsLoading } = useUpcomingPublicEvents(3);
  const { data: siteImages = {} } = useSiteImages();
  const si = (key: string, fallback: string) => siteImages[key] ?? fallback;
  const feedLoading = blogsLoading || eventsLoading;

  const programs = [
    {
      image: si("card_internships", cardInternships),
      title: "Internships & placements",
      description: "Field, lab, and organizational opportunities curated for ABCOSSA members.",
      link: "/internships",
    },
    {
      image: si("card_events", cardEvents),
      title: "Events & workshops",
      description: "What's on—via our shared calendar for talks, field days, and department sessions.",
      link: "/events",
    },
    {
      image: si("card_community", cardCommunity),
      title: "Blog & Articles",
      description: "Stories, research highlights, and updates written by ABCOSSA members and the executive.",
      link: "/news",
    },
  ];

  const campusGallery = [
    { src: si("gallery_snake_plant",     gallerySnakePlant),    alt: "Courtyard with potted plants outside the department" },
    { src: si("gallery_members_1",       galleryNew1),          alt: "ABCOSSA members in the field" },
    { src: si("gallery_campus_entrance", campusEntrance),       alt: "Department building framed by trees and the campus entrance" },
    { src: si("gallery_activity",        galleryNew3),          alt: "ABCOSSA activity" },
    { src: si("gallery_walkway",         galleryApproach),      alt: "Walkway toward the department with sunlight through the canopy" },
    { src: si("gallery_illustration",    abcossaIllustration),  alt: "ABCOSSA character illustration" },
    { src: si("gallery_palm",            galleryPalm),          alt: "Shaded courtyard with palms and colonnade" },
    { src: si("gallery_members_2",       galleryNew2),          alt: "ABCOSSA members during an event" },
    { src: si("gallery_entrance_alt",    galleryEntranceAlt),   alt: "Campus approach with greenery and red-tiled roof" },
  ];

  type FeedItem = { key: string; category: string; date: string; title: string; excerpt: string; href: string };

  const feed: FeedItem[] = isSupabaseConfigured
    ? [
        ...blogs.slice(0, 3).map((b) => ({
          key: `blog-${b.id}`,
          category: b.category,
          date: formatDate(b.published_at),
          title: b.title,
          excerpt: b.excerpt ?? "",
          href: `/news/${b.slug}`,
        })),
        ...events.map((e) => ({
          key: `event-${e.id}`,
          category: e.event_type,
          date: formatDate(e.starts_at),
          title: e.title,
          excerpt: e.description ?? "",
          href: "/events",
        })),
      ]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 3)
    : [];

  return (
    <div className="overflow-hidden">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center">
        <div className="absolute inset-0">
          <img
            src={si("hero", heroImage)}
            alt="University department building and lush trees on campus—sustaining the ecosystem"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-nature" />
        </div>
        
        <div className="relative container mx-auto px-4 lg:px-8 py-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-accent/20 backdrop-blur-sm text-primary-foreground px-4 py-2 rounded-full mb-6 animate-fade-up">
              <Leaf className="w-4 h-4" />
              <span className="text-sm font-medium">Sustaining the ecosystem</span>
            </div>
            
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-primary-foreground mb-6 animate-fade-up delay-100">
              Animal Biology and Conservation Science Student Association
            </h1>
            
            <p className="text-lg md:text-xl text-primary-foreground/90 mb-8 animate-fade-up delay-200 max-w-2xl">
              The Animal Biology and Conservation Science Student Association (ABCOSSA) is a vibrant student body dedicated to promoting environmental conservation, wildlife protection, public health, research and public awareness on sustainability.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 animate-fade-up delay-300">
              <Button variant="hero" size="lg" asChild>
                <Link to="/internships">
                  View internships
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button variant="hero-outline" size="lg" asChild>
                <Link to="/events" className="inline-flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Events
                </Link>
              </Button>
            </div>
          </div>
        </div>
        
        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-float">
          <div className="w-6 h-10 rounded-full border-2 border-primary-foreground/30 flex items-start justify-center p-2">
            <div className="w-1 h-2 bg-primary-foreground/50 rounded-full animate-bounce" />
          </div>
        </div>
      </section>

      {/* Programs Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Get involved
            </h2>
            <p className="text-muted-foreground text-lg">
              Internships, events, and the ways we support members and the department.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {programs.map((program, index) => (
              <Link
                key={program.title}
                to={program.link}
                className="group overflow-hidden rounded-2xl card-nature animate-fade-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="aspect-[4/3] overflow-hidden">
                  <img
                    src={program.image}
                    alt={program.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-6">
                  <h3 className="font-display text-xl font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                    {program.title}
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    {program.description}
                  </p>
                  <span className="inline-flex items-center gap-2 text-primary font-medium group-hover:gap-3 transition-all">
                    Explore <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Campus gallery — real department & grounds */}
      <section className="py-20 bg-background border-y border-border">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Our place in the ecosystem
            </h2>
            <p className="text-muted-foreground text-lg">
              Animal Biology and Conservation Science at the University of Ghana—where teaching, specimens, and green
              spaces meet.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {campusGallery.map((item, index) => (
              <div
                key={item.alt}
                className="overflow-hidden rounded-2xl bg-muted aspect-[3/4] md:aspect-[4/5]"
              >
                <img
                  src={item.src}
                  alt={item.alt}
                  className={`w-full h-full object-cover hover:scale-[1.02] transition-transform duration-500 ${
                    index === 5 ? "object-top bg-white" : ""
                  }`}
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* News Section */}
      {isSupabaseConfigured && (
        <section className="py-20 bg-muted/50">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-12">
              <div>
                <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
                  Latest News & Updates
                </h2>
                <p className="text-muted-foreground">
                  Recent posts and upcoming events from ABCOSSA.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" asChild>
                  <Link to="/news">
                    All posts
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/events">
                    All events
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </div>

            {feedLoading ? (
              <div className="grid md:grid-cols-3 gap-8">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="card-nature p-6 rounded-2xl animate-pulse h-44 bg-muted/50" />
                ))}
              </div>
            ) : feed.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing published yet — check back soon.</p>
            ) : (
              <div className="grid md:grid-cols-3 gap-8">
                {feed.map((item, index) => (
                  <Link
                    key={item.key}
                    to={item.href}
                    className="card-nature p-6 rounded-2xl hover:shadow-elevated transition-all duration-300 animate-fade-up block"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        {item.category}
                      </span>
                      <span className="text-muted-foreground text-sm">{item.date}</span>
                    </div>
                    <h3 className="font-display text-lg font-semibold text-foreground mb-3 hover:text-primary transition-colors">
                      {item.title}
                    </h3>
                    {item.excerpt && (
                      <p className="text-muted-foreground text-sm line-clamp-3">{item.excerpt}</p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="py-16 md:py-20 bg-secondary/30 border-y border-border">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-2xl mx-auto card-nature p-8 md:p-10 rounded-2xl text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Lightbulb className="w-7 h-7 text-primary" />
            </div>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-3">Got an idea? Drop it in the box.</h2>
            <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
              Want to see a field trip, workshop, talk, or community activity happen? This is your space to suggest it.
              No idea is too big or too small — we read every submission.
            </p>
            <Button variant="hero" size="lg" className="w-full sm:w-auto" asChild>
              <a href={EVENT_PROPOSAL_URL} target="_blank" rel="noopener noreferrer">
                Share your idea
                <ExternalLink className="w-5 h-5" />
              </a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
