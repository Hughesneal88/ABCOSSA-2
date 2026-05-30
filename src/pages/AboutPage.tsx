import type { LucideIcon } from "lucide-react";
import {
  Target,
  Eye,
  Users,
  Church,
  Megaphone,
  GraduationCap,
  Wallet,
  CalendarRange,
  Newspaper,
} from "lucide-react";
import missionImage from "@/assets/campus-entrance-hod.png";
import leadershipPresident from "@/assets/leadership-president.png";
import leadershipVicePresident from "@/assets/leadership-vice-president.jpg";
import leadershipGeneralSecretary from "@/assets/leadership-general-secretary.png";
import leadershipDeputyGeneralSecretary from "@/assets/leadership-deputy-general-secretary.png";
import { CORE_VALUES, MISSION_STATEMENT, VISION_STATEMENT } from "@/config/site";
import { useLeadershipMembers } from "@/hooks/useSupabasePublic";
import { isSupabaseConfigured } from "@/integrations/supabase/client";

const leadership: {
  name: string;
  role: string;
  bio: string;
  image?: string;
}[] = [
  {
    name: "Samuel K. Duah",
    role: "President",
    bio: "Leads the executive, chairs meetings, and represents ABCOSSA to the department and partners.",
    image: leadershipPresident,
  },
  {
    name: "Melchizedeck Ansah",
    role: "Vice President",
    bio: "Supports the President, acts in their absence, and helps run programmes and member engagement.",
    image: leadershipVicePresident,
  },
  {
    name: "Dorothy N. A.A. Pentsil",
    role: "General Secretary",
    bio: "Keeps records, correspondence, notices, and minutes so the association stays organised.",
    image: leadershipGeneralSecretary,
  },
  {
    name: "Josephine Asabea Asah",
    role: "Deputy General Secretary",
    bio: "Backs the General Secretary with meetings, records, and follow-up on communications.",
    image: leadershipDeputyGeneralSecretary,
  },
];

const committees: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Chaplaincy Committee",
    description:
      "The Chaplaincy Committee focuses on the spiritual wellbeing of students by organizing prayer sessions, worship activities, and offering guidance and support. It helps create a sense of unity, peace, and moral grounding within the association, fostering a supportive and values-driven environment.",
    icon: Church,
  },
  {
    title: "Media and Publicity Committee",
    description:
      "The Media and Publicity Committee is responsible for promoting the association's activities and keeping members informed. Through content creation, social media management, and announcements, the committee enhances visibility, engagement, and communication within and beyond the student body.",
    icon: Megaphone,
  },
  {
    title: "Academic Committee",
    description:
      "The Academic Committee is dedicated to supporting the academic success of students. It organizes educational programs, study support initiatives, and academic discussions, ensuring that students stay informed, motivated, and equipped to excel in their studies.",
    icon: GraduationCap,
  },
  {
    title: "Finance Committee",
    description:
      "The Finance Committee manages and safeguards the association's funds by ensuring proper budgeting, transparency, and accountability. It plays a key role in sustaining the association's activities by maintaining financial discipline and supporting initiatives that benefit students.",
    icon: Wallet,
  },
  {
    title: "Organizing Committee",
    description:
      "The Organizing Committee handles the planning and execution of events within the association. By coordinating logistics and ensuring smooth operations, it helps create successful and memorable programs that strengthen student participation and community.",
    icon: CalendarRange,
  },
  {
    title: "Editorial Board",
    description:
      "The Editorial Board documents the student association's activities, highlight achievements, and improve visibility through articles, media content, research features, and creative work. It also helps build skills in writing, communication, and scientific literacy among students.",
    icon: Newspaper,
  },
];

export default function AboutPage() {
  const { data: dbLeadership = [], isLoading: leadershipLoading } = useLeadershipMembers();
  const activeLeadership = isSupabaseConfigured
    ? dbLeadership
    : leadership;

  return (
    <div className="overflow-hidden">
      {/* Hero Section */}
      <section className="relative py-20 md:py-28 bg-gradient-nature">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="font-display text-4xl md:text-5xl font-bold text-primary-foreground mb-6 animate-fade-up">
              About ABCOSSA
            </h1>
            <p className="text-xl text-primary-foreground/90 animate-fade-up delay-100">
              ABCOSSA is the student association for Animal Biology and Conservation Science—supporting
              academic growth, research, and conservation engagement on campus and beyond.
            </p>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-20">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="animate-fade-up">
              <img
                src={missionImage}
                alt="Department of Animal Biology and Conservation Science building surrounded by trees"
                className="w-full rounded-2xl shadow-elevated"
              />
            </div>
            <div className="space-y-8 animate-fade-up delay-200">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Eye className="w-6 h-6 text-primary" />
                  </div>
                  <h2 className="font-display text-2xl font-bold text-foreground">Our Vision</h2>
                </div>
                <p className="text-muted-foreground text-lg">{VISION_STATEMENT}</p>
              </div>
              
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
                    <Target className="w-6 h-6 text-accent" />
                  </div>
                  <h2 className="font-display text-2xl font-bold text-foreground">Our Mission</h2>
                </div>
                <p className="text-muted-foreground text-lg">{MISSION_STATEMENT}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Our Core Values
            </h2>
            <p className="text-muted-foreground text-lg">
              The principles that guide everything we do at ABCOSSA.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {CORE_VALUES.map((value, index) => (
              <div
                key={value.title}
                className="card-nature p-6 rounded-2xl text-center animate-fade-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <value.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-display text-xl font-semibold text-foreground mb-2">
                  {value.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Committees */}
      <section className="py-20 border-y border-border bg-background">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Committees
            </h2>
            <p className="text-muted-foreground text-lg">
              Standing committees that run programmes, support members, and keep ABCOSSA active across campus.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {committees.map((c, index) => (
              <div
                key={c.title}
                className="card-nature p-6 rounded-2xl animate-fade-up text-left"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <c.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground mb-3">{c.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{c.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Leadership */}
      <section className="py-20 bg-muted/50">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Our Leadership
            </h2>
            <p className="text-muted-foreground text-lg">
              Meet the dedicated team guiding ABCOSSA's mission.
            </p>
          </div>

          {leadershipLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="card-nature p-6 rounded-2xl animate-pulse h-56 bg-muted/50" />
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {activeLeadership.map((person, index) => {
                const imgSrc = "image_url" in person ? person.image_url : (person as { image?: string }).image;
                return (
                  <div
                    key={person.name}
                    className="card-nature p-6 rounded-2xl text-center animate-fade-up"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="w-24 h-24 rounded-full overflow-hidden mx-auto mb-4 ring-2 ring-primary/15 bg-primary/10 flex items-center justify-center shrink-0">
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={`Portrait of ${person.name}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Users className="w-10 h-10 text-primary" />
                      )}
                    </div>
                    <h3 className="font-display text-lg font-semibold text-foreground mb-1">{person.name}</h3>
                    <p className="text-accent font-medium text-sm mb-3">{person.role}</p>
                    <p className="text-muted-foreground text-sm">{person.bio}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
