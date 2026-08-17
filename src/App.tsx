import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Loader2 } from "lucide-react";

// Route-based code splitting for fast initial page load
const HomePage = lazy(() => import("./pages/HomePage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const InternshipsPage = lazy(() => import("./pages/InternshipsPage"));
const NewsPage = lazy(() => import("./pages/NewsPage"));
const BlogPostPage = lazy(() => import("./pages/BlogPostPage"));
const EventsPage = lazy(() => import("./pages/EventsPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AdminContentPage = lazy(() => import("./pages/AdminContentPage"));
const ResearchPage = lazy(() => import("./pages/ResearchPage"));
const ResourcesPage = lazy(() => import("./pages/ResourcesPage"));
const NomineesPage = lazy(() => import("./pages/NomineesPage"));

const queryClient = new QueryClient();

// Smooth page skeleton fallback during route transitions
function PageSkeleton() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4 p-8">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary animate-pulse">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
      <p className="text-xs text-muted-foreground font-medium animate-pulse">Loading ABCOSSA content...</p>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/admin" element={<AdminContentPage />} />
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/internships" element={<InternshipsPage />} />
              <Route path="/programs" element={<Navigate to="/internships" replace />} />
              <Route path="/research" element={<ResearchPage />} />
              <Route path="/nominees" element={<NomineesPage />} />
              <Route path="/news" element={<NewsPage />} />
              <Route path="/news/:slug" element={<BlogPostPage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/resources" element={<ResourcesPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
