import {
  Mail,
  Phone,
  MapPin,
  Clock,
  Send,
  Instagram,
  Twitter,
  Music2,
  Ghost,
  MessageCircle,
  Link2,
  Linkedin,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import { CONTACT, MAPS_EMBED_SRC, SOCIAL } from "@/config/site";
import { useSiteSetting } from "@/hooks/useSupabasePublic";
import { supabase } from "@/integrations/supabase/client";

// contactInfo is built inside the component so it picks up the dynamic email

const socialLinks: { name: string; href: string; icon: typeof Instagram }[] = [
  { name: "Instagram", href: SOCIAL.instagram, icon: Instagram },
  { name: "LinkedIn", href: SOCIAL.linkedin, icon: Linkedin },
  { name: "TikTok", href: SOCIAL.tiktok, icon: Music2 },
  { name: "X (Twitter)", href: SOCIAL.twitter, icon: Twitter },
  { name: "Snapchat", href: SOCIAL.snapchat, icon: Ghost },
  { name: "WhatsApp channel", href: SOCIAL.whatsapp, icon: MessageCircle },
  { name: "Linktree", href: SOCIAL.linktree, icon: Link2 },
];

export default function ContactPage() {
  const { data: contactEmail } = useSiteSetting("contact_email");
  const displayEmail = contactEmail ?? CONTACT.email;

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const contactInfo = [
    {
      icon: MapPin,
      title: "Our Location",
      details: [CONTACT.departmentName, CONTACT.streetAddress, CONTACT.postalAddress],
    },
    { icon: Phone, title: "Phone", details: [CONTACT.phoneDisplay] },
    { icon: Mail, title: "Email", details: [displayEmail] },
    {
      icon: Clock,
      title: "Office Hours",
      details: ["Reach out by phone or email to connect with the executive committee or arrange a visit to the department."],
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    if (supabase) {
      const { error } = await supabase.functions.invoke("send-contact-email", {
        body: {
          name: formData.name.trim(),
          email: formData.email.trim(),
          subject: formData.subject,
          message: formData.message.trim(),
        },
      });
      if (error) {
        setSubmitting(false);
        toast({ title: "Something went wrong", description: "Please try again or email us directly.", variant: "destructive" });
        return;
      }
    }
    setSubmitting(false);
    toast({
      title: "Message sent!",
      description: "We'll get back to you soon.",
    });
    setFormData({ name: "", email: "", subject: "", message: "" });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="overflow-hidden">
      {/* Hero Section */}
      <section className="relative py-20 md:py-28 bg-gradient-nature">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="font-display text-4xl md:text-5xl font-bold text-primary-foreground mb-6 animate-fade-up">
              Contact Us
            </h1>
            <p className="text-xl text-primary-foreground/90 animate-fade-up delay-100">
              Have questions or want to get involved? We'd love to hear from you.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Form + Info */}
      <section className="py-20">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-12">
            {/* Contact Form */}
            <div className="lg:col-span-2">
              <div className="card-nature p-6 md:p-8 rounded-2xl">
                <h2 className="font-display text-2xl font-bold text-foreground mb-6">
                  Send Us a Message
                </h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                        Your Name *
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                        className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="john@example.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium text-foreground mb-2">
                      Subject *
                    </label>
                    <select
                      id="subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Select a subject</option>
                      <option value="general">General Inquiry</option>
                      <option value="admissions">Admissions</option>
                      <option value="internship">Internship listing</option>
                      <option value="partnership">Partnership Opportunity</option>
                      <option value="media">Media/Press</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-foreground mb-2">
                      Message *
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      required
                      rows={6}
                      className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                      placeholder="Tell us how we can help..."
                    />
                  </div>

                  <Button type="submit" variant="hero" size="lg" className="w-full sm:w-auto" disabled={submitting}>
                    <Send className="w-4 h-4" />
                    {submitting ? "Sending…" : "Send Message"}
                  </Button>
                </form>
              </div>
            </div>

            {/* Contact Info Sidebar */}
            <div className="space-y-6">
              {contactInfo.map((item, index) => (
                <div
                  key={item.title}
                  className="card-nature p-6 rounded-xl animate-fade-up"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
                      {item.details.map((detail, i) => (
                        <p key={i} className="text-muted-foreground text-sm">
                          {detail}
                        </p>
                      ))}
                      {item.title === "Our Location" && (
                        <a
                          href={CONTACT.mapsSearchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary text-sm font-medium mt-2 hover:underline"
                        >
                          Open in Google Maps
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {item.title === "Phone" && (
                        <a
                          href={`tel:${CONTACT.phoneTel}`}
                          className="inline-block text-primary text-sm font-medium mt-2 hover:underline"
                        >
                          Call {CONTACT.phoneDisplay}
                        </a>
                      )}
                      {item.title === "Email" && (
                        <a
                          href={`mailto:${displayEmail}`}
                          className="inline-block text-primary text-sm font-medium mt-2 hover:underline"
                        >
                          Email us
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Social Media */}
              <div className="card-nature p-6 rounded-xl">
                <h3 className="font-semibold text-foreground mb-4">Follow Us</h3>
                <div className="flex flex-wrap gap-3">
                  {socialLinks.map((social) => (
                    <a
                      key={social.name}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
                      aria-label={social.name}
                    >
                      <social.icon className="w-5 h-5" />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Map Section */}
      <section className="py-12 bg-secondary/30">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="card-nature rounded-2xl overflow-hidden">
            <div className="aspect-[21/9] min-h-[320px] bg-muted">
              <iframe
                title={`Map: ${CONTACT.departmentName}`}
                src={MAPS_EMBED_SRC}
                className="w-full h-full min-h-[320px] border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <div className="p-4 text-center text-sm text-muted-foreground border-t border-border">
              <a
                href={CONTACT.mapsSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-medium hover:underline"
              >
                {CONTACT.streetAddress}
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
