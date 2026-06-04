import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RESOURCES_TELEGRAM_URL } from "@/config/site";
import { useSiteImages } from "@/hooks/useSupabasePublic";
import abcossaLogo from "@/assets/WhatsApp Image 2026-05-05 at 5.23.56 PM.jpeg";

type NavItem =
  | { name: string; href: string }
  | { name: string; href: string; external: true };

const navigation: NavItem[] = [
  { name: "Home", href: "/" },
  { name: "Internships", href: "/internships" },
  { name: "Blog & Articles", href: "/news" },
  { name: "Research", href: "/research" },
  { name: "Events", href: "/events" },
  { name: "Resources", href: RESOURCES_TELEGRAM_URL, external: true },
  { name: "About", href: "/about" },
  { name: "Contact", href: "/contact" },
];

function isActive(pathname: string, item: NavItem) {
  if ("external" in item && item.external) return false;
  return pathname === item.href;
}

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { data: siteImages = {} } = useSiteImages();
  const logoSrc = siteImages["navbar_logo"] ?? abcossaLogo;

  const linkClass = (item: NavItem) =>
    cn(
      "px-3 py-2 text-sm font-medium rounded-md transition-colors",
      isActive(location.pathname, item)
        ? "text-primary bg-primary/5"
        : "text-muted-foreground hover:text-foreground hover:bg-muted"
    );

  const mobileLinkClass = (item: NavItem) =>
    cn(
      "px-4 py-3 text-base font-medium rounded-lg transition-colors",
      isActive(location.pathname, item)
        ? "text-primary bg-primary/10"
        : "text-muted-foreground hover:text-foreground hover:bg-muted"
    );

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
      <nav className="container mx-auto px-4 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={logoSrc}
              alt="ABCOSSA logo"
              className="w-12 h-12 rounded-full object-cover"
            />
            <div className="hidden sm:block">
              <span className="font-display font-bold text-xl text-foreground">ABCOSSA</span>
              <p className="text-xs text-muted-foreground leading-snug max-w-[11rem]">
                Sustaining the ecosystem
              </p>
            </div>
          </Link>

          <div className="hidden lg:flex items-center gap-1 flex-wrap justify-end">
            {navigation.map((item) =>
              "external" in item && item.external ? (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass(item)}
                >
                  {item.name}
                </a>
              ) : (
                <Link key={item.name} to={item.href} className={linkClass(item)}>
                  {item.name}
                </Link>
              )
            )}
            <Link
              to="/admin"
              className={cn(
                "ml-1 pl-3 border-l border-border/60 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                location.pathname === "/admin"
                  ? "text-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              Staff portal
            </Link>
          </div>

          <button
            className="lg:hidden p-2 text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            type="button"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden py-4 animate-fade-in">
            <div className="flex flex-col gap-2">
              {navigation.map((item) =>
                "external" in item && item.external ? (
                  <a
                    key={item.name}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMobileMenuOpen(false)}
                    className={mobileLinkClass(item)}
                  >
                    {item.name}
                  </a>
                ) : (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={mobileLinkClass(item)}
                  >
                    {item.name}
                  </Link>
                )
              )}
              <Link
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "px-4 py-3 text-base font-medium rounded-lg transition-colors border-t border-border/60 mt-2 pt-4",
                  location.pathname === "/admin"
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                Staff portal
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
