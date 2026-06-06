import { Link } from "react-router-dom";
import { Mail, Phone, MapPin, Instagram, Twitter, Music2, Ghost, MessageCircle, Link2, Linkedin } from "lucide-react";
import { CONTACT, RESOURCES_TELEGRAM_URL, SOCIAL } from "@/config/site";

const footerLinks = {
  quickLinks: [
    { name: "Blog & Articles", href: "/news" },
    { name: "Events", href: "/events" },
    { name: "Research", href: "/research" },
    { name: "Internships", href: "/internships" },
    { name: "About Us", href: "/about" },
    { name: "Contact Us", href: "/contact" },
    { name: "Staff portal", href: "/admin" },
  ],
  resources: [{ name: "Resources", href: RESOURCES_TELEGRAM_URL, external: true }] as const,
};

const socialLinks = [
  { name: "Instagram", icon: Instagram, href: SOCIAL.instagram },
  { name: "LinkedIn", icon: Linkedin, href: SOCIAL.linkedin },
  { name: "TikTok", icon: Music2, href: SOCIAL.tiktok },
  { name: "X", icon: Twitter, href: SOCIAL.twitter },
  { name: "Snapchat", icon: Ghost, href: SOCIAL.snapchat },
  { name: "WhatsApp", icon: MessageCircle, href: SOCIAL.whatsapp },
  { name: "Linktree", icon: Link2, href: SOCIAL.linktree },
];

export function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground">
      {/* Main Footer */}
      <div className="container mx-auto px-4 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Link to="/" className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary-foreground flex items-center justify-center">
                <span className="text-primary font-display font-bold text-lg">A</span>
              </div>
              <span className="font-display font-bold text-xl">ABCOSSA</span>
            </Link>
            <p className="text-primary-foreground/70 text-sm mb-6">
              Student association for Animal Biology and Conservation Science—advancing research, conservation, and sustainable solutions together.
            </p>
            <div className="flex flex-wrap gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-primary-foreground/20 transition-colors"
                  aria-label={social.name}
                >
                  <social.icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-display font-semibold text-lg mb-4">Quick Links</h4>
            <ul className="space-y-3">
              {footerLinks.quickLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.href}
                    className="text-primary-foreground/70 hover:text-primary-foreground transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-display font-semibold text-lg mb-4">Resources</h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.name}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-foreground/70 hover:text-primary-foreground transition-colors"
                    >
                      {link.name}
                    </a>
                  ) : (
                    <Link
                      to={link.href}
                      className="text-primary-foreground/70 hover:text-primary-foreground transition-colors"
                    >
                      {link.name}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-display font-semibold text-lg mb-4">Contact Us</h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 mt-0.5 text-accent shrink-0" />
                <span className="text-primary-foreground/70 text-sm">
                  {CONTACT.departmentName}
                  <br />
                  {CONTACT.streetAddress}
                  <br />
                  {CONTACT.postalAddress}
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-accent shrink-0" />
                <a href={`tel:${CONTACT.phoneTel}`} className="text-primary-foreground/70 hover:text-primary-foreground text-sm">
                  {CONTACT.phoneDisplay}
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-accent shrink-0" />
                <a href={`mailto:${CONTACT.email}`} className="text-primary-foreground/70 hover:text-primary-foreground text-sm">
                  {CONTACT.email}
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t border-primary-foreground/10">
        <div className="container mx-auto px-4 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-primary-foreground/60">
            <p>© {new Date().getFullYear()} ABCOSSA. All rights reserved.</p>
            <div className="flex gap-6">
              <Link to="/privacy" className="hover:text-primary-foreground transition-colors">
                Privacy Policy
              </Link>
              <Link to="/terms" className="hover:text-primary-foreground transition-colors">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
