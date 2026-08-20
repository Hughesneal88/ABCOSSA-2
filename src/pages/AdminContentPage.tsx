import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  LogOut,
  Trash2,
  ExternalLink,
  Leaf,
  KeyRound,
  Users,
  Settings,
  Mail,
  BookOpen,
  Check,
  X as XIcon,
  Image,
  FolderOpen,
  ChevronUp,
  ChevronDown,
  Award,
  CreditCard,
  Clock,
  Smartphone,
  PhoneCall,
  Copy,
  Hash,
} from "lucide-react";
import { parsePDFNomineeFile, type ParsedNominee } from "@/lib/pdfNomineeParser";
import {
  useVotePrice,
  useUpdateVotePrice,
  useUssdSettings,
  useUpdateUssdSettings,
  useAutoGenerateNomineeCodes,
  type AwardCategory,
  type NomineeRow,
  type NomineePdfUpload,
} from "@/hooks/useNominees";
import { usePayments, usePaystackSettings, useUpdatePaystackSettings } from "@/hooks/usePayments";
import { formatGHS, type PaymentRecord } from "@/lib/paystackClient";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { getMainSiteUrl } from "@/lib/domainRouting";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { slugifyTitle, uniqueSlug } from "@/lib/slugify";
import type { Session, User } from "@supabase/supabase-js";

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["internships"] });
  qc.invalidateQueries({ queryKey: ["public-events"] });
  qc.invalidateQueries({ queryKey: ["public-announcements"] });
  qc.invalidateQueries({ queryKey: ["public-blog"] });
  qc.invalidateQueries({ queryKey: ["blog-post"] });
  qc.invalidateQueries({ queryKey: ["lecturers"] });
  qc.invalidateQueries({ queryKey: ["research-works-public"] });
  qc.invalidateQueries({ queryKey: ["nominees"] });
  qc.invalidateQueries({ queryKey: ["nominee-pdfs"] });
  qc.invalidateQueries({ queryKey: ["award-categories"] });
  qc.invalidateQueries({ queryKey: ["admin-payments"] });
  qc.invalidateQueries({ queryKey: ["paystack-settings"] });
  qc.invalidateQueries({ queryKey: ["hubtel-settings"] });
};

function AccountSettingsPanel({ user }: { user: User }) {
  const qc = useQueryClient();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated. Use it on the sign-in page.");
    setNewPassword("");
    setConfirmPassword("");
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const next = newEmail.trim().toLowerCase();
    const confirm = confirmEmail.trim().toLowerCase();
    if (!next || !confirm) return;
    if (next !== confirm) {
      toast.error("Email addresses do not match.");
      return;
    }
    if (next === user.email?.toLowerCase()) {
      toast.message("That is already your email.");
      return;
    }
    setEmailSaving(true);
    const { data: updated, error: dbError } = await supabase
      .from("content_editors")
      .update({ email: next })
      .eq("user_id", user.id)
      .select("email")
      .maybeSingle();
    if (dbError) {
      setEmailSaving(false);
      toast.error(dbError.message);
      return;
    }
    if (!updated) {
      setEmailSaving(false);
      toast.error(
        "Could not update editor row. Open the latest SQL migration in Supabase (user_id on content_editors), refresh, sign in again, then retry.",
      );
      return;
    }
    const redirectTo = `${window.location.origin}/admin`;
    const { error: authError } = await supabase.auth.updateUser({ email: next }, { emailRedirectTo: redirectTo });
    setEmailSaving(false);
    if (authError) {
      toast.error(authError.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["content-editor"] });
    toast.success("Confirm the link sent to your new email, then sign in with that address.");
    setNewEmail("");
    setConfirmEmail("");
  };

  return (
    <div className="space-y-8 max-w-lg">
      <section className="card-nature p-6 rounded-2xl space-y-4">
        <h2 className="font-display text-lg font-semibold">Password</h2>
        <p className="text-sm text-muted-foreground">
          Change the password for <strong>{user.email}</strong> (used on the sign-in screen).
        </p>
        <form onSubmit={submitPassword} className="space-y-4">
          <div>
            <Label htmlFor="acct-new-pw">New password</Label>
            <Input
              id="acct-new-pw"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1.5"
              minLength={6}
            />
          </div>
          <div>
            <Label htmlFor="acct-confirm-pw">Confirm password</Label>
            <Input
              id="acct-confirm-pw"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1.5"
              minLength={6}
            />
          </div>
          <Button type="submit" disabled={passwordSaving}>
            {passwordSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update password"}
          </Button>
        </form>
      </section>

      <section className="card-nature p-6 rounded-2xl space-y-4">
        <h2 className="font-display text-lg font-semibold">Email</h2>
        <p className="text-sm text-muted-foreground">
          Updates this site&apos;s editor list and your Supabase login. You will confirm the new address from your inbox.
          Keep redirect URL <code className="text-xs bg-muted px-1 rounded">{window.location.origin}/admin</code> allowed in
          Supabase Auth settings.
        </p>
        <form onSubmit={submitEmail} className="space-y-4">
          <div>
            <Label htmlFor="acct-new-email">New email</Label>
            <Input
              id="acct-new-email"
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="acct-confirm-email">Confirm new email</Label>
            <Input
              id="acct-confirm-email"
              type="email"
              required
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={emailSaving}>
            {emailSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Change email"}
          </Button>
        </form>
      </section>
    </div>
  );
}

export default function AdminContentPage() {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [pwdEmail, setPwdEmail] = useState("");
  const [pwdPassword, setPwdPassword] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setAuthLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const { data: isEditor, isLoading: editorLoading } = useQuery({
    queryKey: ["content-editor", user?.id, user?.email],
    queryFn: async () => {
      if (!supabase || !user?.email || !user?.id) return false;
      const { data, error } = await supabase
        .from("content_editors")
        .select("email")
        .or(`user_id.eq.${user.id},email.eq.${user.email}`)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    enabled: Boolean(supabase && user?.email && user?.id),
  });

  useEffect(() => {
    if (!supabase || !user?.id || !user?.email || !isEditor) return;
    void (async () => {
      const { data: row } = await supabase
        .from("content_editors")
        .select("user_id")
        .or(`user_id.eq.${user.id},email.eq.${user.email}`)
        .maybeSingle();
      if (!row?.user_id) {
        const { error } = await supabase
          .from("content_editors")
          .update({ user_id: user.id })
          .eq("email", user.email)
          .is("user_id", null);
        if (!error) qc.invalidateQueries({ queryKey: ["content-editor"] });
      }
    })();
  }, [supabase, user?.id, user?.email, isEditor, qc]);

  const submitPasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !pwdEmail.trim() || !pwdPassword) return;
    setPwdLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: pwdEmail.trim().toLowerCase(),
      password: pwdPassword,
    });
    setPwdLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Signed in");
    setPwdPassword("");
  };

  const signOut = async (message = "Signed out") => {
    if (!supabase) return;
    localStorage.removeItem("abcossa_admin_session_start");
    await supabase.auth.signOut();
    qc.clear();
    toast.message(message);
  };

  const handleSessionTimeout = useCallback(() => {
    if (!supabase) return;
    localStorage.removeItem("abcossa_admin_session_start");
    void supabase.auth.signOut();
    qc.clear();
    toast.warning("Session timed out due to inactivity. Please sign in again.", {
      duration: 6000,
    });
  }, [qc]);

  const { showWarning, secondsRemaining, extendSession } = useSessionTimeout({
    inactivityTimeoutMs: 15 * 60 * 1000, // 15 minutes inactivity timeout
    warningThresholdMs: 60 * 1000,       // 1 minute warning threshold
    maxSessionLifetimeMs: 8 * 60 * 60 * 1000, // 8 hours max session lifetime
    onTimeout: handleSessionTimeout,
    isAuthenticated: Boolean(user && isEditor),
  });

  if (!isSupabaseConfigured || !supabase) {
    return (
      <div className="min-h-screen bg-background p-8 max-w-xl mx-auto">
        <h1 className="font-display text-2xl font-bold mb-4">Staff portal</h1>
        <p className="text-muted-foreground mb-4">
          Add <code className="text-xs bg-muted px-1 rounded">VITE_SUPABASE_URL</code> and{" "}
          <code className="text-xs bg-muted px-1 rounded">VITE_SUPABASE_ANON_KEY</code> to your{" "}
          <code className="text-xs bg-muted px-1 rounded">.env</code> file, run the SQL in{" "}
          <code className="text-xs bg-muted px-1 rounded">supabase/migrations/</code> in the Supabase SQL Editor, then
          refresh this page.
        </p>
        <Button variant="outline" asChild>
          <Link to="/">Back to website</Link>
        </Button>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-nature flex items-center justify-center p-6">
        <div className="w-full max-w-md card-nature p-8 rounded-2xl shadow-elevated">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
              <Leaf className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">ABCOSSA staff portal</h1>
              <p className="text-sm text-muted-foreground">Post internships, events, news &amp; blogs</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Sign in with your staff email and password. If you don't have access yet, contact the site administrator to get your account set up. Once signed in, you can update your password anytime from the <strong>Account</strong> tab.
          </p>
          <form onSubmit={submitPasswordSignIn} className="space-y-4">
            <div>
              <Label htmlFor="staff-email-pwd">Email</Label>
              <Input
                id="staff-email-pwd"
                type="email"
                required
                value={pwdEmail}
                onChange={(e) => setPwdEmail(e.target.value)}
                placeholder="you@university.edu.gh"
                className="mt-1.5"
                autoComplete="username"
              />
            </div>
            <div>
              <Label htmlFor="staff-password">Password</Label>
              <Input
                id="staff-password"
                type="password"
                required
                autoComplete="current-password"
                value={pwdPassword}
                onChange={(e) => setPwdPassword(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <Button type="submit" className="w-full" disabled={pwdLoading}>
              {pwdLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-6 text-center">
            <Link to="/" className="underline">
              Return to public site
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (editorLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!isEditor) {
    return (
      <div className="min-h-screen p-8 max-w-lg mx-auto">
        <h1 className="text-xl font-bold mb-4">Access not enabled</h1>
        <p className="text-muted-foreground mb-6">
          Signed in as <strong>{user.email}</strong>. Ask your site administrator to add this email in Supabase (table{" "}
          <code className="text-xs bg-muted px-1">content_editors</code>).
        </p>
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="container max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-bold">ABCOSSA — update the website</h1>
            <p className="text-xs text-muted-foreground">
              Use the tabs below. Everything you save can appear on the public site when &quot;Show on website&quot; is on.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted px-2.5 py-1 rounded-full border border-border/60 font-medium">
              <Clock className="w-3 h-3 text-amber-500" /> Auto-logout: 15m inactivity
            </span>
            <Button variant="outline" size="sm" asChild>
              <a href={getMainSiteUrl()} target="_blank" rel="noreferrer">
                View site <ExternalLink className="w-3.5 h-3.5 ml-1" />
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut("Signed out")}>
              <LogOut className="w-4 h-4 mr-1" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-4 py-8">
        <Tabs defaultValue="internships" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="internships">Internships</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="announcements">Announcements</TabsTrigger>
            <TabsTrigger value="blog">Blog / news</TabsTrigger>
            <TabsTrigger value="leadership" className="gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Leadership
            </TabsTrigger>
            <TabsTrigger value="nominees" className="gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-500" />
              Nominees & Awards
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-emerald-500" />
              Payments & Finance
            </TabsTrigger>
            <TabsTrigger value="settings">Site settings</TabsTrigger>
            <TabsTrigger value="images">Site Images</TabsTrigger>
            <TabsTrigger value="resources">Student resources</TabsTrigger>
            <TabsTrigger value="research">Research directory</TabsTrigger>
            <TabsTrigger value="account">My account</TabsTrigger>
          </TabsList>

          <TabsContent value="account">
            <AccountSettingsPanel user={user} />
          </TabsContent>

          <TabsContent value="internships">
            <InternshipsAdminPanel />
          </TabsContent>
          <TabsContent value="events">
            <EventsAdminPanel />
          </TabsContent>
          <TabsContent value="announcements">
            <AnnouncementsAdminPanel />
          </TabsContent>
          <TabsContent value="blog">
            <BlogAdminPanel userId={user.id} />
          </TabsContent>
          <TabsContent value="leadership">
            <LeadershipAdminPanel userId={user.id} />
          </TabsContent>
          <TabsContent value="nominees">
            <NomineesAdminPanel />
          </TabsContent>
          <TabsContent value="payments">
            <PaymentsAdminPanel />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsAdminPanel />
          </TabsContent>
          <TabsContent value="images">
            <SiteImagesAdminPanel />
          </TabsContent>
          <TabsContent value="resources">
            <ResourcesAdminPanel />
          </TabsContent>
          <TabsContent value="research">
            <ResearchAdminPanel userId={user.id} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Session Timeout Warning Modal */}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-card border border-border shadow-2xl rounded-2xl p-6 max-w-md w-full space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-foreground">Session Timing Out Soon</h3>
              <p className="text-xs text-muted-foreground">
                You have been inactive. Your session will expire in{" "}
                <span className="font-bold text-amber-500 font-mono text-sm">{secondsRemaining}s</span> due to inactivity.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => signOut("Signed out")}>
                Sign Out Now
              </Button>
              <Button size="sm" className="flex-1 text-xs font-semibold" onClick={extendSession}>
                Stay Logged In
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type InternshipRow = { id: string; title: string; organization: string; location: string | null; timeframe: string | null; deadline: string | null; description: string; apply_url: string | null; tags: string[]; is_published: boolean; cover_image_url: string | null; logo_url: string | null };

function InternshipsAdminPanel() {
  const qc = useQueryClient();
  const { data: rows = [], refetch } = useQuery({
    queryKey: ["admin-internships"],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("internships").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InternshipRow[];
    },
  });

  const [title, setTitle] = useState("");
  const [organization, setOrganization] = useState("");
  const [location, setLocation] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [deadline, setDeadline] = useState("");
  const [description, setDescription] = useState("");
  const [applyUrl, setApplyUrl] = useState("");
  const [tags, setTags] = useState("");
  const [published, setPublished] = useState(true);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editOrg, setEditOrg] = useState("");
  const [editLoc, setEditLoc] = useState("");
  const [editTimeframe, setEditTimeframe] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editApplyUrl, setEditApplyUrl] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editLogoFile, setEditLogoFile] = useState<File | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const startEdit = (r: InternshipRow) => {
    setEditingId(r.id);
    setEditTitle(r.title);
    setEditOrg(r.organization);
    setEditLoc(r.location ?? "");
    setEditTimeframe(r.timeframe ?? "");
    setEditDeadline(r.deadline ?? "");
    setEditDesc(r.description);
    setEditApplyUrl(r.apply_url ?? "");
    setEditTags((r.tags ?? []).join(", "));
    setEditCoverFile(null);
    setEditLogoFile(null);
  };

  const uploadIntFile = async (file: File, prefix: string) => {
    if (!supabase) return null;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${prefix}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("internship-images").upload(path, file, { upsert: false });
    if (error) throw error;
    return supabase.storage.from("internship-images").getPublicUrl(path).data.publicUrl;
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !editingId) return;
    setEditSaving(true);
    const patch: Record<string, unknown> = {
      title: editTitle.trim(),
      organization: editOrg.trim(),
      location: editLoc.trim() || null,
      timeframe: editTimeframe.trim() || null,
      deadline: editDeadline.trim() || null,
      description: editDesc.trim(),
      apply_url: editApplyUrl.trim() || null,
      tags: editTags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    try {
      if (editCoverFile) patch.cover_image_url = await uploadIntFile(editCoverFile, "cover");
      if (editLogoFile) patch.logo_url = await uploadIntFile(editLogoFile, "logo");
    } catch (err) {
      setEditSaving(false);
      toast.error(err instanceof Error ? err.message : "Upload failed");
      return;
    }
    const { error } = await supabase.from("internships").update(patch).eq("id", editingId);
    setEditSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Internship updated");
    setEditingId(null);
    invalidateAll(qc);
    refetch();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    let coverImageUrl: string | null = null;
    let logoUrl: string | null = null;
    try {
      if (coverFile) coverImageUrl = await uploadIntFile(coverFile, "cover");
      if (logoFile) logoUrl = await uploadIntFile(logoFile, "logo");
    } catch (err) {
      setSaving(false);
      toast.error(err instanceof Error ? err.message : "Upload failed");
      return;
    }
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    const { error } = await supabase.from("internships").insert({
      title: title.trim(), organization: organization.trim(), location: location.trim() || null,
      timeframe: timeframe.trim() || null, deadline: deadline.trim() || null,
      description: description.trim(), apply_url: applyUrl.trim() || null,
      tags: tagList, is_published: published, cover_image_url: coverImageUrl, logo_url: logoUrl,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Internship added");
    setTitle(""); setOrganization(""); setLocation(""); setTimeframe("");
    setDeadline(""); setDescription(""); setApplyUrl(""); setTags("");
    setCoverFile(null); setLogoFile(null);
    invalidateAll(qc); refetch();
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this internship listing?") || !supabase) return;
    const { error } = await supabase.from("internships").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Removed"); invalidateAll(qc); refetch(); }
  };

  const togglePub = async (id: string, next: boolean) => {
    if (!supabase) return;
    const { error } = await supabase.from("internships").update({ is_published: next }).eq("id", id);
    if (error) toast.error(error.message);
    else { invalidateAll(qc); refetch(); }
  };

  return (
    <div className="space-y-8">
      <section className="card-nature p-6 rounded-2xl space-y-4">
        <h2 className="font-display text-lg font-semibold">Add an internship</h2>
        <p className="text-sm text-muted-foreground">
          Fields are what visitors see on the Internships page. Separate tags with commas (e.g. Field, Paid, Accra).
        </p>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Role title</Label>
            <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Field assistant — coastal birds" />
          </div>
          <div>
            <Label>Host organization</Label>
            <Input className="mt-1" value={organization} onChange={(e) => setOrganization(e.target.value)} required />
          </div>
          <div>
            <Label>Location</Label>
            <Input className="mt-1" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Accra / remote" />
          </div>
          <div>
            <Label>When (e.g. Summer 2026)</Label>
            <Input className="mt-1" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} />
          </div>
          <div>
            <Label>Apply-by date</Label>
            <Input className="mt-1" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Description</Label>
            <Textarea className="mt-1 min-h-[100px]" value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
          <div className="sm:col-span-2">
            <Label>Application link (optional)</Label>
            <Input className="mt-1" type="url" value={applyUrl} onChange={(e) => setApplyUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="sm:col-span-2">
            <Label>Tags</Label>
            <Input className="mt-1" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Field, Paid" />
          </div>
          <div>
            <Label>Cover image (optional)</Label>
            <Input className="mt-1" type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground mt-1">Wide banner shown at the top of the listing card.</p>
          </div>
          <div>
            <Label>Organisation logo (optional)</Label>
            <Input className="mt-1" type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground mt-1">Small logo shown next to the organisation name.</p>
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <Switch id="int-pub" checked={published} onCheckedChange={setPublished} />
            <Label htmlFor="int-pub">Show on website</Label>
          </div>
          <Button type="submit" disabled={saving} className="sm:col-span-2 w-full sm:w-auto">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save internship"}
          </Button>
        </form>
      </section>

      <section>
        <h3 className="font-medium mb-3">Current listings</h3>
        <ul className="space-y-2">
          {rows.map((r) =>
            editingId === r.id ? (
              <li key={r.id} className="card-nature p-4 rounded-xl border-2 border-primary/20">
                <form onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Role title</Label>
                    <Input className="mt-1" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
                  </div>
                  <div>
                    <Label className="text-xs">Host organization</Label>
                    <Input className="mt-1" value={editOrg} onChange={(e) => setEditOrg(e.target.value)} required />
                  </div>
                  <div>
                    <Label className="text-xs">Location</Label>
                    <Input className="mt-1" value={editLoc} onChange={(e) => setEditLoc(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">When</Label>
                    <Input className="mt-1" value={editTimeframe} onChange={(e) => setEditTimeframe(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Apply-by date</Label>
                    <Input className="mt-1" type="date" value={editDeadline} onChange={(e) => setEditDeadline(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Description</Label>
                    <Textarea className="mt-1 min-h-[80px]" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} required />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Application link (optional)</Label>
                    <Input className="mt-1" type="url" value={editApplyUrl} onChange={(e) => setEditApplyUrl(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Tags (comma-separated)</Label>
                    <Input className="mt-1" value={editTags} onChange={(e) => setEditTags(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Replace cover image (optional)</Label>
                    <Input className="mt-1" type="file" accept="image/*" onChange={(e) => setEditCoverFile(e.target.files?.[0] ?? null)} />
                    {r.cover_image_url && !editCoverFile && <p className="text-xs text-muted-foreground mt-1">Current image kept unless replaced.</p>}
                  </div>
                  <div>
                    <Label className="text-xs">Replace organisation logo (optional)</Label>
                    <Input className="mt-1" type="file" accept="image/*" onChange={(e) => setEditLogoFile(e.target.files?.[0] ?? null)} />
                    {r.logo_url && !editLogoFile && <p className="text-xs text-muted-foreground mt-1">Current logo kept unless replaced.</p>}
                  </div>
                  <div className="sm:col-span-2 flex gap-2">
                    <Button type="submit" size="sm" disabled={editSaving}>
                      {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={r.id} className="flex flex-wrap items-center gap-3 card-nature p-3 rounded-xl text-sm">
                <span className="flex-1 font-medium">{r.title}</span>
                <span className="text-xs text-muted-foreground">{r.organization}</span>
                <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={() => startEdit(r)}>Edit</Button>
                <div className="flex items-center gap-2">
                  <Switch checked={r.is_published} onCheckedChange={(c) => togglePub(r.id, c)} />
                  <span className="text-muted-foreground text-xs">Visible</span>
                </div>
                <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(r.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </li>
            )
          )}
        </ul>
      </section>
    </div>
  );
}

type EventRow = { id: string; title: string; event_type: string; location: string | null; starts_at: string; ends_at: string | null; description: string | null; register_url: string | null; featured: boolean; is_published: boolean; cover_image_url: string | null };

function EventsAdminPanel() {
  const qc = useQueryClient();
  const { data: rows = [], refetch } = useQuery({
    queryKey: ["admin-events"],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("events").select("*").order("starts_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState("Workshop");
  const [loc, setLoc] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [desc, setDesc] = useState("");
  const [regUrl, setRegUrl] = useState("");
  const [featured, setFeatured] = useState(false);
  const [published, setPublished] = useState(true);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("Workshop");
  const [editLoc, setEditLoc] = useState("");
  const [editStarts, setEditStarts] = useState("");
  const [editEnds, setEditEnds] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editRegUrl, setEditRegUrl] = useState("");
  const [editFeatured, setEditFeatured] = useState(false);
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const toDatetimeLocal = (iso: string | null) => {
    if (!iso) return "";
    return new Date(iso).toISOString().slice(0, 16);
  };

  const startEdit = (r: EventRow) => {
    setEditingId(r.id);
    setEditTitle(r.title);
    setEditType(r.event_type);
    setEditLoc(r.location ?? "");
    setEditStarts(toDatetimeLocal(r.starts_at));
    setEditEnds(toDatetimeLocal(r.ends_at));
    setEditDesc(r.description ?? "");
    setEditRegUrl(r.register_url ?? "");
    setEditFeatured(r.featured);
    setEditCoverFile(null);
  };

  const uploadEventCover = async (file: File) => {
    if (!supabase) return null;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `cover-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("event-images").upload(path, file, { upsert: false });
    if (error) throw error;
    return supabase.storage.from("event-images").getPublicUrl(path).data.publicUrl;
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !editingId) return;
    setEditSaving(true);
    let coverImageUrl: string | undefined = undefined;
    if (editCoverFile) {
      try { coverImageUrl = await uploadEventCover(editCoverFile) ?? undefined; }
      catch (err) { setEditSaving(false); toast.error(err instanceof Error ? err.message : "Upload failed"); return; }
    }
    const patch: Record<string, unknown> = {
      title: editTitle.trim(),
      event_type: editType,
      location: editLoc.trim() || null,
      starts_at: new Date(editStarts).toISOString(),
      ends_at: editEnds.trim() ? new Date(editEnds).toISOString() : null,
      description: editDesc.trim() || null,
      register_url: editRegUrl.trim() || null,
      featured: editFeatured,
    };
    if (coverImageUrl !== undefined) patch.cover_image_url = coverImageUrl;
    const { error } = await supabase.from("events").update(patch).eq("id", editingId);
    setEditSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Event updated");
    setEditingId(null);
    invalidateAll(qc);
    refetch();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    let coverImageUrl: string | null = null;
    if (coverFile) {
      try { coverImageUrl = await uploadEventCover(coverFile); }
      catch (err) { setSaving(false); toast.error(err instanceof Error ? err.message : "Upload failed"); return; }
    }
    const { error } = await supabase.from("events").insert({
      title: title.trim(), event_type: eventType, location: loc.trim() || null,
      starts_at: new Date(starts).toISOString(), ends_at: ends.trim() ? new Date(ends).toISOString() : null,
      description: desc.trim() || null, register_url: regUrl.trim() || null,
      featured, is_published: published, cover_image_url: coverImageUrl,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Event added");
    setTitle(""); setLoc(""); setStarts(""); setEnds(""); setDesc(""); setRegUrl(""); setFeatured(false); setCoverFile(null);
    invalidateAll(qc); refetch();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this event?") || !supabase) return;
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); invalidateAll(qc); refetch(); }
  };

  const togglePub = async (id: string, next: boolean) => {
    if (!supabase) return;
    await supabase.from("events").update({ is_published: next }).eq("id", id);
    invalidateAll(qc); refetch();
  };

  return (
    <div className="space-y-8">
      <section className="card-nature p-6 rounded-2xl space-y-4">
        <h2 className="font-display text-lg font-semibold">Add an event</h2>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Event name</Label>
            <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Workshop", "Seminar", "Conference", "Outreach", "Social", "Other"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Location</Label>
            <Input className="mt-1" value={loc} onChange={(e) => setLoc(e.target.value)} />
          </div>
          <div>
            <Label>Starts</Label>
            <Input className="mt-1" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} required />
          </div>
          <div>
            <Label>Ends (optional)</Label>
            <Input className="mt-1" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Details</Label>
            <Textarea className="mt-1" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Sign-up link (optional)</Label>
            <Input className="mt-1" type="url" value={regUrl} onChange={(e) => setRegUrl(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Cover image (optional)</Label>
            <Input className="mt-1" type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground mt-1">Wide banner shown at the top of the event card.</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ev-feat" checked={featured} onCheckedChange={setFeatured} />
            <Label htmlFor="ev-feat">Featured</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ev-pub" checked={published} onCheckedChange={setPublished} />
            <Label htmlFor="ev-pub">Show on website</Label>
          </div>
          <Button type="submit" disabled={saving} className="sm:col-span-2 w-full sm:w-auto">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save event"}
          </Button>
        </form>
      </section>

      <ul className="space-y-2">
        {rows.map((r) =>
          editingId === r.id ? (
            <li key={r.id} className="card-nature p-4 rounded-xl border-2 border-primary/20">
              <form onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label className="text-xs">Event name</Label>
                  <Input className="mt-1" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
                </div>
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={editType} onValueChange={setEditType}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Workshop", "Seminar", "Conference", "Outreach", "Social", "Other"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Location</Label>
                  <Input className="mt-1" value={editLoc} onChange={(e) => setEditLoc(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Starts</Label>
                  <Input className="mt-1" type="datetime-local" value={editStarts} onChange={(e) => setEditStarts(e.target.value)} required />
                </div>
                <div>
                  <Label className="text-xs">Ends (optional)</Label>
                  <Input className="mt-1" type="datetime-local" value={editEnds} onChange={(e) => setEditEnds(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Details</Label>
                  <Textarea className="mt-1" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Sign-up link (optional)</Label>
                  <Input className="mt-1" type="url" value={editRegUrl} onChange={(e) => setEditRegUrl(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Replace cover image (optional)</Label>
                  <Input className="mt-1" type="file" accept="image/*" onChange={(e) => setEditCoverFile(e.target.files?.[0] ?? null)} />
                  {r.cover_image_url && !editCoverFile && (
                    <p className="text-xs text-muted-foreground mt-1">Current image kept unless you upload a new one.</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="edit-ev-feat" checked={editFeatured} onCheckedChange={setEditFeatured} />
                  <Label htmlFor="edit-ev-feat" className="text-xs">Featured</Label>
                </div>
                <div className="sm:col-span-2 flex gap-2">
                  <Button type="submit" size="sm" disabled={editSaving}>
                    {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </form>
            </li>
          ) : (
            <li key={r.id} className="flex flex-wrap items-center gap-3 card-nature p-3 rounded-xl text-sm">
              <span className="flex-1">
                <span className="font-medium">{r.title}</span>
                <span className="text-muted-foreground ml-2 text-xs">{new Date(r.starts_at).toLocaleString()}</span>
              </span>
              <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={() => startEdit(r)}>Edit</Button>
              <Switch checked={r.is_published} onCheckedChange={(c) => togglePub(r.id, c)} />
              <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(r.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </li>
          )
        )}
      </ul>
    </div>
  );
}

type AnnouncementRow = { id: string; title: string; body: string; link_url: string | null; is_published: boolean };

function AnnouncementsAdminPanel() {
  const qc = useQueryClient();
  const { data: rows = [], refetch } = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AnnouncementRow[];
    },
  });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [published, setPublished] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const startEdit = (r: AnnouncementRow) => {
    setEditingId(r.id);
    setEditTitle(r.title);
    setEditBody(r.body);
    setEditLinkUrl(r.link_url ?? "");
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !editingId) return;
    setEditSaving(true);
    const { error } = await supabase.from("announcements").update({
      title: editTitle.trim(),
      body: editBody.trim(),
      link_url: editLinkUrl.trim() || null,
    }).eq("id", editingId);
    setEditSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Updated");
    setEditingId(null);
    invalidateAll(qc);
    refetch();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    const { error } = await supabase.from("announcements").insert({
      title: title.trim(),
      body: body.trim(),
      link_url: linkUrl.trim() || null,
      is_published: published,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Announcement posted");
    setTitle(""); setBody(""); setLinkUrl("");
    invalidateAll(qc);
    refetch();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete?") || !supabase) return;
    await supabase.from("announcements").delete().eq("id", id);
    invalidateAll(qc);
    refetch();
  };

  const togglePub = async (id: string, next: boolean) => {
    if (!supabase) return;
    await supabase.from("announcements").update({ is_published: next }).eq("id", id);
    invalidateAll(qc);
    refetch();
  };

  return (
    <div className="space-y-8">
      <section className="card-nature p-6 rounded-2xl space-y-4">
        <h2 className="font-display text-lg font-semibold">Add an announcement</h2>
        <p className="text-sm text-muted-foreground">Short updates shown at the top of Blog &amp; Articles.</p>
        <form onSubmit={submit} className="space-y-4 max-w-2xl">
          <div>
            <Label>Headline</Label>
            <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label>Message</Label>
            <Textarea className="mt-1 min-h-[120px]" value={body} onChange={(e) => setBody(e.target.value)} required />
          </div>
          <div>
            <Label>Extra link (optional)</Label>
            <Input className="mt-1" type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="an-pub" checked={published} onCheckedChange={setPublished} />
            <Label htmlFor="an-pub">Show on website</Label>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post announcement"}
          </Button>
        </form>
      </section>

      <ul className="space-y-2">
        {rows.map((r) =>
          editingId === r.id ? (
            <li key={r.id} className="card-nature p-4 rounded-xl border-2 border-primary/20">
              <form onSubmit={saveEdit} className="space-y-3 max-w-2xl">
                <div>
                  <Label className="text-xs">Headline</Label>
                  <Input className="mt-1" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
                </div>
                <div>
                  <Label className="text-xs">Message</Label>
                  <Textarea className="mt-1 min-h-[100px]" value={editBody} onChange={(e) => setEditBody(e.target.value)} required />
                </div>
                <div>
                  <Label className="text-xs">Extra link (optional)</Label>
                  <Input className="mt-1" type="url" value={editLinkUrl} onChange={(e) => setEditLinkUrl(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={editSaving}>
                    {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </form>
            </li>
          ) : (
            <li key={r.id} className="flex flex-wrap items-center gap-3 card-nature p-3 rounded-xl text-sm">
              <span className="flex-1 font-medium">{r.title}</span>
              <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={() => startEdit(r)}>Edit</Button>
              <Switch checked={r.is_published} onCheckedChange={(c) => togglePub(r.id, c)} />
              <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(r.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </li>
          )
        )}
      </ul>
    </div>
  );
}

type BlogRow = { id: string; title: string; slug: string; category: string; excerpt: string | null; body: string; is_published: boolean; published_at: string; cover_image_url: string | null };

function BlogAdminPanel({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: rows = [], refetch } = useQuery({
    queryKey: ["admin-blog"],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("blog_posts").select("*").order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BlogRow[];
    },
  });

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("News");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [published, setPublished] = useState(true);
  const [pubDate, setPubDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("News");
  const [editExcerpt, setEditExcerpt] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editPubDate, setEditPubDate] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const startEdit = (r: BlogRow) => {
    setEditingId(r.id);
    setEditTitle(r.title);
    setEditCategory(r.category);
    setEditExcerpt(r.excerpt ?? "");
    setEditBody(r.body);
    setEditPubDate(r.published_at ? r.published_at.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setEditFile(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !editingId) return;
    setEditSaving(true);
    const patch: Record<string, unknown> = {
      title: editTitle.trim(),
      category: editCategory,
      excerpt: editExcerpt.trim() || null,
      body: editBody.trim(),
      published_at: new Date(editPubDate + "T12:00:00").toISOString(),
    };
    if (editFile) {
      const ext = editFile.name.split(".").pop() || "jpg";
      const path = `${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("blog-covers").upload(path, editFile, { upsert: false });
      if (upErr) { setEditSaving(false); toast.error(upErr.message); return; }
      patch.cover_image_url = supabase.storage.from("blog-covers").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase.from("blog_posts").update(patch).eq("id", editingId);
    setEditSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Article updated");
    setEditingId(null);
    invalidateAll(qc); refetch();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    let coverUrl: string | null = null;
    if (file) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("blog-covers").upload(path, file, { upsert: false });
      if (upErr) {
        setSaving(false);
        toast.error(upErr.message);
        return;
      }
      const { data: pub } = supabase.storage.from("blog-covers").getPublicUrl(path);
      coverUrl = pub.publicUrl;
    }

    let slug = slugifyTitle(title);
    if (!slug) slug = uniqueSlug("post");

    let { error } = await supabase.from("blog_posts").insert({
      title: title.trim(),
      slug,
      excerpt: excerpt.trim() || null,
      body: body.trim(),
      category,
      cover_image_url: coverUrl,
      is_published: published,
      published_at: new Date(pubDate + "T12:00:00").toISOString(),
    });

    if (error && String(error.code) === "23505") {
      slug = uniqueSlug(slug);
      const second = await supabase.from("blog_posts").insert({
        title: title.trim(),
        slug,
        excerpt: excerpt.trim() || null,
        body: body.trim(),
        category,
        cover_image_url: coverUrl,
        is_published: published,
        published_at: new Date(pubDate + "T12:00:00").toISOString(),
      });
      error = second.error;
    }

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Article published");
    setTitle("");
    setExcerpt("");
    setBody("");
    setFile(null);
    invalidateAll(qc);
    refetch();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this article?") || !supabase) return;
    await supabase.from("blog_posts").delete().eq("id", id);
    invalidateAll(qc);
    refetch();
  };

  const togglePub = async (id: string, next: boolean) => {
    if (!supabase) return;
    await supabase.from("blog_posts").update({ is_published: next }).eq("id", id);
    invalidateAll(qc);
    refetch();
  };

  return (
    <div className="space-y-8">
      <section className="card-nature p-6 rounded-2xl space-y-4">
        <h2 className="font-display text-lg font-semibold">Write a story</h2>
        <p className="text-sm text-muted-foreground">
          Write in normal paragraphs. The site shows your text as you type it here. Optional: add a cover photo.
        </p>
        <form onSubmit={submit} className="space-y-4 max-w-2xl">
          <div>
            <Label>Story title</Label>
            <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["News", "Events", "Research", "Community", "Partnership", "Announcement"].map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Short summary (optional)</Label>
            <Textarea className="mt-1" rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          </div>
          <div>
            <Label>Article</Label>
            <Textarea className="mt-1 min-h-[200px]" value={body} onChange={(e) => setBody(e.target.value)} required />
          </div>
          <div>
            <Label>Cover photo (optional)</Label>
            <Input className="mt-1" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <Label>Publication date</Label>
            <Input className="mt-1" type="date" value={pubDate} onChange={(e) => setPubDate(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="bl-pub" checked={published} onCheckedChange={setPublished} />
            <Label htmlFor="bl-pub">Show on website</Label>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Publish article"}
          </Button>
        </form>
      </section>

      <ul className="space-y-2">
        {rows.map((r) =>
          editingId === r.id ? (
            <li key={r.id} className="card-nature p-4 rounded-xl border-2 border-primary/20">
              <form onSubmit={saveEdit} className="space-y-3 max-w-2xl">
                <div>
                  <Label className="text-xs">Story title</Label>
                  <Input className="mt-1" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
                </div>
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select value={editCategory} onValueChange={setEditCategory}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["News", "Events", "Research", "Community", "Partnership", "Announcement"].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Short summary (optional)</Label>
                  <Textarea className="mt-1" rows={2} value={editExcerpt} onChange={(e) => setEditExcerpt(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Article body</Label>
                  <Textarea className="mt-1 min-h-[160px]" value={editBody} onChange={(e) => setEditBody(e.target.value)} required />
                </div>
                <div>
                  <Label className="text-xs">Replace cover photo (optional)</Label>
                  <Input className="mt-1" type="file" accept="image/*" onChange={(e) => setEditFile(e.target.files?.[0] ?? null)} />
                  {r.cover_image_url && !editFile && <p className="text-xs text-muted-foreground mt-1">Current cover kept unless replaced.</p>}
                </div>
                <div>
                  <Label className="text-xs">Publication date</Label>
                  <Input className="mt-1" type="date" value={editPubDate} onChange={(e) => setEditPubDate(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={editSaving}>
                    {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </form>
            </li>
          ) : (
            <li key={r.id} className="flex flex-wrap items-center gap-3 card-nature p-3 rounded-xl text-sm">
              <span className="flex-1 font-medium">{r.title}</span>
              <Link to={`/news/${r.slug}`} target="_blank" rel="noreferrer" className="text-primary text-xs underline">View</Link>
              <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={() => startEdit(r)}>Edit</Button>
              <Switch checked={r.is_published} onCheckedChange={(c) => togglePub(r.id, c)} />
              <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(r.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </li>
          )
        )}
      </ul>
    </div>
  );
}

const LEADERSHIP_ROLES = [
  { role: "President", order: 0 },
  { role: "Vice President", order: 1 },
  { role: "General Secretary", order: 2 },
  { role: "Deputy General Secretary", order: 3 },
] as const;

type LeadershipRow = { id: string; name: string; role: string; bio: string; image_url: string | null; display_order: number; is_active: boolean };

function LeadershipSlotCard({ slot, existing, userId, onSaved }: {
  slot: { role: string; order: number };
  existing: LeadershipRow | undefined;
  userId: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [bio, setBio] = useState(existing?.bio ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(existing?.image_url ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setName(existing?.name ?? ""); setBio(existing?.bio ?? ""); setPreview(existing?.image_url ?? null); }, [existing?.id]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f) setPreview(URL.createObjectURL(f));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);

    let imageUrl: string | null = existing?.image_url ?? null;
    if (file) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/${slot.order}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("leadership-images").upload(path, file, { upsert: true });
      if (upErr) { setSaving(false); toast.error(upErr.message); return; }
      const { data: pub } = supabase.storage.from("leadership-images").getPublicUrl(path);
      imageUrl = pub.publicUrl;
    }

    if (existing) {
      const { error } = await supabase.from("leadership_members").update({
        name: name.trim(), bio: bio.trim(), image_url: imageUrl, is_active: true,
      }).eq("id", existing.id);
      if (error) { setSaving(false); toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("leadership_members").insert({
        name: name.trim(), role: slot.role, bio: bio.trim(),
        image_url: imageUrl, display_order: slot.order, is_active: true,
      });
      if (error) { setSaving(false); toast.error(error.message); return; }
    }

    setSaving(false);
    setFile(null);
    toast.success(`${slot.role} updated`);
    onSaved();
  };

  return (
    <div className="card-nature p-5 rounded-2xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center shrink-0 ring-2 ring-primary/15">
          {preview
            ? <img src={preview} alt={slot.role} className="w-full h-full object-cover" />
            : <Users className="w-6 h-6 text-primary" />}
        </div>
        <div>
          <p className="font-display font-semibold text-foreground">{slot.role}</p>
          {existing?.name && <p className="text-sm text-muted-foreground">{existing.name}</p>}
        </div>
      </div>

      <form onSubmit={save} className="space-y-3">
        <div>
          <Label>Full name</Label>
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Ama Owusu" />
        </div>
        <div>
          <Label>Short bio</Label>
          <Textarea className="mt-1" rows={2} value={bio} onChange={(e) => setBio(e.target.value)} required placeholder="One or two sentences about their responsibilities." />
        </div>
        <div>
          <Label>{existing?.image_url ? "Replace photo" : "Upload photo"}</Label>
          <Input className="mt-1" type="file" accept="image/*" onChange={handleFile} />
        </div>
        <Button type="submit" size="sm" disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save changes"}
        </Button>
      </form>
    </div>
  );
}

function AdditionalLeaderCard({ member, userId, onSaved, onDeleted }: {
  member: LeadershipRow;
  userId: string;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState(member.role);
  const [bio, setBio] = useState(member.bio ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(member.image_url ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(member.name); setRole(member.role); setBio(member.bio ?? ""); setPreview(member.image_url ?? null);
  }, [member.id]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f) setPreview(URL.createObjectURL(f));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    let imageUrl: string | null = member.image_url ?? null;
    if (file) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/${member.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("leadership-images").upload(path, file, { upsert: true });
      if (upErr) { setSaving(false); toast.error(upErr.message); return; }
      imageUrl = supabase.storage.from("leadership-images").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase.from("leadership_members").update({
      name: name.trim(), role: role.trim(), bio: bio.trim(), image_url: imageUrl, is_active: true,
    }).eq("id", member.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setFile(null);
    toast.success(`${name} updated`);
    onSaved();
  };

  const deleteMember = async () => {
    if (!confirm(`Remove ${member.name} from leadership?`) || !supabase) return;
    const { error } = await supabase.from("leadership_members").delete().eq("id", member.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${member.name} removed`);
    onDeleted();
  };

  return (
    <div className="card-nature p-5 rounded-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center shrink-0 ring-2 ring-primary/15">
            {preview
              ? <img src={preview} alt={member.name} className="w-full h-full object-cover" />
              : <Users className="w-6 h-6 text-primary" />}
          </div>
          <div className="min-w-0">
            <p className="font-display font-semibold text-foreground truncate">{member.name}</p>
            <p className="text-xs text-muted-foreground truncate">{member.role}</p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" className="text-destructive shrink-0" onClick={deleteMember} title="Remove member">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <form onSubmit={save} className="space-y-3">
        <div>
          <Label>Role / title</Label>
          <Input className="mt-1" value={role} onChange={(e) => setRole(e.target.value)} required placeholder="e.g. Financial Secretary" />
        </div>
        <div>
          <Label>Full name</Label>
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <Label>Short bio</Label>
          <Textarea className="mt-1" rows={2} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="One or two sentences about their responsibilities." />
        </div>
        <div>
          <Label>{member.image_url ? "Replace photo" : "Upload photo"}</Label>
          <Input className="mt-1" type="file" accept="image/*" onChange={handleFile} />
        </div>
        <Button type="submit" size="sm" disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save changes"}
        </Button>
      </form>
    </div>
  );
}

function LeadershipAdminPanel({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: rows = [], refetch } = useQuery({
    queryKey: ["admin-leadership"],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("leadership_members").select("*");
      if (error) throw error;
      return (data ?? []) as LeadershipRow[];
    },
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [addRole, setAddRole] = useState("");
  const [addName, setAddName] = useState("");
  const [addBio, setAddBio] = useState("");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addSaving, setAddSaving] = useState(false);

  const onSaved = () => {
    qc.invalidateQueries({ queryKey: ["leadership-members"] });
    refetch();
  };

  const coreRoles = new Set(LEADERSHIP_ROLES.map((r) => r.role));
  const coreRows = rows.filter((r) => coreRoles.has(r.role));
  const additionalMembers = [...rows.filter((r) => !coreRoles.has(r.role))].sort(
    (a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id),
  );

  // Core slots sorted by their DB row's display_order; fall back to constant order
  const sortedCoreSlots = [...LEADERSHIP_ROLES].sort((a, b) => {
    const oa = coreRows.find((r) => r.role === a.role)?.display_order ?? a.order;
    const ob = coreRows.find((r) => r.role === b.role)?.display_order ?? b.order;
    return oa - ob;
  });

  const swapDisplayOrder = async (idA: string, orderA: number, idB: string, orderB: number) => {
    if (!supabase) return;
    await Promise.all([
      supabase.from("leadership_members").update({ display_order: orderB }).eq("id", idA),
      supabase.from("leadership_members").update({ display_order: orderA }).eq("id", idB),
    ]);
    onSaved();
  };

  const moveCore = async (role: string, direction: "up" | "down") => {
    const idx = sortedCoreSlots.findIndex((s) => s.role === role);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sortedCoreSlots.length) return;
    const rowA = coreRows.find((r) => r.role === sortedCoreSlots[idx].role);
    const rowB = coreRows.find((r) => r.role === sortedCoreSlots[swapIdx].role);
    if (!rowA || !rowB) return;
    await swapDisplayOrder(rowA.id, rowA.display_order, rowB.id, rowB.display_order);
  };

  const moveAdditional = async (id: string, direction: "up" | "down") => {
    const idx = additionalMembers.findIndex((r) => r.id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= additionalMembers.length) return;
    const a = additionalMembers[idx];
    const b = additionalMembers[swapIdx];
    await swapDisplayOrder(a.id, a.display_order, b.id, b.display_order);
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAddSaving(true);
    let imageUrl: string | null = null;
    if (addFile) {
      const ext = addFile.name.split(".").pop() || "jpg";
      const path = `${userId}/custom-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("leadership-images").upload(path, addFile, { upsert: false });
      if (upErr) { setAddSaving(false); toast.error(upErr.message); return; }
      imageUrl = supabase.storage.from("leadership-images").getPublicUrl(path).data.publicUrl;
    }
    const nextOrder = rows.length > 0 ? Math.max(...rows.map((r) => r.display_order)) + 1 : 10;
    const { error } = await supabase.from("leadership_members").insert({
      name: addName.trim(),
      role: addRole.trim(),
      bio: addBio.trim(),
      image_url: imageUrl,
      display_order: nextOrder,
      is_active: true,
    });
    setAddSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${addName} added`);
    setAddRole(""); setAddName(""); setAddBio(""); setAddFile(null);
    setShowAddForm(false);
    onSaved();
  };

  return (
    <div className="space-y-10">
      {/* Core executive */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Core executive</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Update each position directly. Use the arrows to reorder how they appear on the About page.
          </p>
        </div>
        <div className="space-y-3">
          {sortedCoreSlots.map((slot, idx) => {
            const rowExists = !!coreRows.find((r) => r.role === slot.role);
            const prevRowExists = idx > 0 && !!coreRows.find((r) => r.role === sortedCoreSlots[idx - 1].role);
            const nextRowExists = idx < sortedCoreSlots.length - 1 && !!coreRows.find((r) => r.role === sortedCoreSlots[idx + 1].role);
            return (
              <div key={slot.role} className="flex gap-2 items-start">
                <div className="flex flex-col gap-0.5 pt-3 shrink-0">
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-6 w-6 text-muted-foreground disabled:opacity-20"
                    disabled={idx === 0 || !rowExists || !prevRowExists}
                    onClick={() => moveCore(slot.role, "up")}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-6 w-6 text-muted-foreground disabled:opacity-20"
                    disabled={idx === sortedCoreSlots.length - 1 || !rowExists || !nextRowExists}
                    onClick={() => moveCore(slot.role, "down")}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex-1">
                  <LeadershipSlotCard
                    slot={slot}
                    existing={rows.find((r) => r.role === slot.role)}
                    userId={userId}
                    onSaved={onSaved}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Additional members */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Additional members</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Other positions (e.g. Financial Secretary, PRO) shown below the core executive on the About page.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? "Cancel" : "+ Add member"}
          </Button>
        </div>

        {showAddForm && (
          <div className="card-nature p-5 rounded-2xl border-2 border-primary/20 space-y-4">
            <p className="font-display font-semibold text-foreground">New member</p>
            <form onSubmit={addMember} className="space-y-3">
              <div>
                <Label>Role / title</Label>
                <Input className="mt-1" value={addRole} onChange={(e) => setAddRole(e.target.value)} required placeholder="e.g. Financial Secretary" />
              </div>
              <div>
                <Label>Full name</Label>
                <Input className="mt-1" value={addName} onChange={(e) => setAddName(e.target.value)} required placeholder="e.g. Ama Owusu" />
              </div>
              <div>
                <Label>Short bio</Label>
                <Textarea className="mt-1" rows={2} value={addBio} onChange={(e) => setAddBio(e.target.value)} placeholder="One or two sentences about their responsibilities." />
              </div>
              <div>
                <Label>Photo (optional)</Label>
                <Input className="mt-1" type="file" accept="image/*" onChange={(e) => setAddFile(e.target.files?.[0] ?? null)} />
              </div>
              <Button type="submit" size="sm" disabled={addSaving} className="w-full">
                {addSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add member"}
              </Button>
            </form>
          </div>
        )}

        {additionalMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No additional members yet — use "+ Add member" above.</p>
        ) : (
          <div className="space-y-3">
            {additionalMembers.map((member, idx) => (
              <div key={member.id} className="flex gap-2 items-start">
                <div className="flex flex-col gap-0.5 pt-3 shrink-0">
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-6 w-6 text-muted-foreground disabled:opacity-20"
                    disabled={idx === 0}
                    onClick={() => moveAdditional(member.id, "up")}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-6 w-6 text-muted-foreground disabled:opacity-20"
                    disabled={idx === additionalMembers.length - 1}
                    onClick={() => moveAdditional(member.id, "down")}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex-1">
                  <AdditionalLeaderCard
                    member={member}
                    userId={userId}
                    onSaved={onSaved}
                    onDeleted={onSaved}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SettingsAdminPanel() {
  const qc = useQueryClient();

  const { data: savedEmail } = useQuery({
    queryKey: ["admin-setting-contact_email"],
    queryFn: async () => {
      if (!supabase) return "";
      const { data } = await supabase.from("site_settings").select("value").eq("key", "contact_email").maybeSingle();
      return (data as { value: string } | null)?.value ?? "";
    },
  });
  const [contactEmail, setContactEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  useEffect(() => { if (savedEmail !== undefined) setContactEmail(savedEmail); }, [savedEmail]);

  const saveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setEmailSaving(true);
    const { error } = await supabase.from("site_settings").upsert({ key: "contact_email", value: contactEmail.trim() });
    setEmailSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Contact email updated");
    qc.invalidateQueries({ queryKey: ["site-setting", "contact_email"] });
    qc.invalidateQueries({ queryKey: ["admin-setting-contact_email"] });
  };

  const { data: submissions = [], refetch: refetchSubmissions } = useQuery({
    queryKey: ["admin-contact-submissions"],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("contact_submissions").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const markRead = async (id: string, next: boolean) => {
    if (!supabase) return;
    await supabase.from("contact_submissions").update({ is_read: next }).eq("id", id);
    refetchSubmissions();
  };

  const removeSubmission = async (id: string) => {
    if (!confirm("Delete this message?") || !supabase) return;
    await supabase.from("contact_submissions").delete().eq("id", id);
    refetchSubmissions();
  };

  const unread = (submissions as { is_read: boolean }[]).filter((s) => !s.is_read).length;

  return (
    <div className="space-y-10 max-w-2xl">
      <section className="card-nature p-6 rounded-2xl space-y-4">
        <h2 className="font-display text-lg font-semibold">Contact email</h2>
        <p className="text-sm text-muted-foreground">
          The email shown on the Contact page. Change it here — no code needed.
        </p>
        <form onSubmit={saveEmail} className="flex gap-3">
          <Input
            type="email"
            required
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="abcossa22@gmail.com"
            className="flex-1"
          />
          <Button type="submit" disabled={emailSaving}>
            {emailSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" />
          <h2 className="font-display text-lg font-semibold">
            Contact inbox
            {unread > 0 && (
              <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-primary text-primary-foreground">{unread} new</span>
            )}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">Messages submitted via the Contact page appear here.</p>
        {(submissions as { id: string }[]).length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <ul className="space-y-3">
            {(submissions as { id: string; name: string; email: string; subject: string; message: string; is_read: boolean; created_at: string }[]).map((s) => (
              <li key={s.id} className={`card-nature p-4 rounded-xl text-sm space-y-2 ${!s.is_read ? "border-l-4 border-primary" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="font-medium">{s.name}</span>
                    <a href={`mailto:${s.email}`} className="text-primary ml-2 hover:underline">{s.email}</a>
                    <span className="text-muted-foreground ml-2 text-xs">{new Date(s.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={() => markRead(s.id, !s.is_read)}>
                      {s.is_read ? "Mark unread" : "Mark read"}
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="text-destructive h-7 w-7" onClick={() => removeSubmission(s.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="font-medium text-foreground">{s.subject}</p>
                <p className="text-muted-foreground whitespace-pre-wrap">{s.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type LecturerLink = { label: string; url: string };

type LecturerRow = {
  id: string;
  name: string;
  bio: string | null;
  research_interests: string[];
  email: string | null;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  links: LecturerLink[];
};

type ResearchWorkRow = {
  id: string;
  title: string;
  author_name: string;
  author_type: string;
  category: string;
  abstract: string | null;
  year: number | null;
  link_url: string | null;
  file_url: string | null;
  tags: string[];
  is_published: boolean;
  created_at: string;
};

function LecturerEditCard({
  lecturer,
  userId,
  onSaved,
  onDeleted,
}: {
  lecturer: LecturerRow;
  userId: string;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(lecturer.name);
  const [bio, setBio] = useState(lecturer.bio ?? "");
  const [interests, setInterests] = useState(lecturer.research_interests.join(", "));
  const [email, setEmail] = useState(lecturer.email ?? "");
  const [links, setLinks] = useState<LecturerLink[]>(lecturer.links ?? []);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(lecturer.image_url);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(lecturer.name);
    setBio(lecturer.bio ?? "");
    setInterests(lecturer.research_interests.join(", "));
    setEmail(lecturer.email ?? "");
    setLinks(lecturer.links ?? []);
    setPreview(lecturer.image_url);
  }, [lecturer.id]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f) setPreview(URL.createObjectURL(f));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    let imageUrl: string | null = lecturer.image_url;
    if (file) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/${lecturer.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("lecturer-images").upload(path, file, { upsert: true });
      if (upErr) { setSaving(false); toast.error(upErr.message); return; }
      imageUrl = supabase.storage.from("lecturer-images").getPublicUrl(path).data.publicUrl;
    }
    const interestList = interests.split(",").map((t) => t.trim()).filter(Boolean);
    const { error } = await supabase.from("lecturers").update({
      name: name.trim(),
      bio: bio.trim() || null,
      research_interests: interestList,
      email: email.trim() || null,
      image_url: imageUrl,
      links: links.filter((l) => l.label.trim() && l.url.trim()),
    }).eq("id", lecturer.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${name} updated`);
    setFile(null);
    onSaved();
  };

  const deleteLecturer = async () => {
    if (!confirm(`Remove ${lecturer.name} from the lecturer list?`) || !supabase) return;
    const { error } = await supabase.from("lecturers").delete().eq("id", lecturer.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${lecturer.name} removed`);
    onDeleted();
  };

  return (
    <div className="card-nature p-5 rounded-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center shrink-0 ring-2 ring-primary/15">
            {preview
              ? <img src={preview} alt={lecturer.name} className="w-full h-full object-cover" />
              : <span className="text-xl font-bold text-primary/30">{lecturer.name.charAt(0)}</span>}
          </div>
          <p className="font-display font-semibold text-foreground truncate">{lecturer.name}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-destructive shrink-0"
          onClick={deleteLecturer}
          title="Remove lecturer"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <form onSubmit={save} className="space-y-3">
        <div>
          <Label>Name</Label>
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <Label>Bio</Label>
          <Textarea className="mt-1" rows={2} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Short biography." />
        </div>
        <div>
          <Label>Research interests (comma-separated)</Label>
          <Input className="mt-1" value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="Wildlife ecology, Herpetology" />
        </div>
        <div>
          <Label>Email</Label>
          <Input className="mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label>Links</Label>
          <div className="mt-1.5 space-y-2">
            {links.map((link, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  placeholder="Label (e.g. Google Scholar)"
                  value={link.label}
                  onChange={(e) => setLinks(links.map((l, idx) => idx === i ? { ...l, label: e.target.value } : l))}
                  className="flex-1"
                />
                <Input
                  placeholder="https://..."
                  type="url"
                  value={link.url}
                  onChange={(e) => setLinks(links.map((l, idx) => idx === i ? { ...l, url: e.target.value } : l))}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive shrink-0"
                  onClick={() => setLinks(links.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLinks([...links, { label: "", url: "" }])}
            >
              + Add link
            </Button>
          </div>
        </div>
        <div>
          <Label>{lecturer.image_url ? "Replace photo" : "Upload photo"}</Label>
          <Input className="mt-1" type="file" accept="image/*" onChange={handleFile} />
        </div>
        <Button type="submit" size="sm" disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
        </Button>
      </form>
    </div>
  );
}

const SITE_IMAGE_SLOTS = [
  { key: "navbar_logo",           label: "Navbar logo",                  hint: "Square/round logo in the top navigation bar" },
  { key: "hero",                  label: "Homepage hero",                 hint: "Wide landscape behind the main headline" },
  { key: "card_internships",      label: "Homepage — Internships card",   hint: "Image on the 'Internships & placements' card" },
  { key: "card_events",           label: "Homepage — Events card",        hint: "Image on the 'Events & workshops' card" },
  { key: "card_community",        label: "Homepage — Blog card",          hint: "Image on the 'Blog & Articles' card" },
  { key: "about_mission",         label: "About — mission photo",         hint: "Photo beside Mission & Vision text" },
  { key: "gallery_snake_plant",   label: "Gallery 1 — courtyard plants",  hint: "" },
  { key: "gallery_members_1",     label: "Gallery 2 — members field",     hint: "" },
  { key: "gallery_campus_entrance", label: "Gallery 3 — campus entrance", hint: "" },
  { key: "gallery_activity",      label: "Gallery 4 — ABCOSSA activity",  hint: "" },
  { key: "gallery_walkway",       label: "Gallery 5 — campus walkway",    hint: "" },
  { key: "gallery_illustration",  label: "Gallery 6 — ABCOSSA illustration", hint: "" },
  { key: "gallery_palm",          label: "Gallery 7 — courtyard palm",    hint: "" },
  { key: "gallery_members_2",     label: "Gallery 8 — members event",     hint: "" },
  { key: "gallery_entrance_alt",  label: "Gallery 9 — entrance alt",      hint: "" },
] as const;

function SiteImagesAdminPanel() {
  const qc = useQueryClient();
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const { data: currentImages = {}, refetch } = useQuery({
    queryKey: ["admin-site-images"],
    queryFn: async () => {
      if (!supabase) return {};
      const { data, error } = await supabase.from("site_images").select("key,url");
      if (error) throw error;
      return Object.fromEntries(
        (data as { key: string; url: string }[]).map((r) => [r.key, r.url]),
      ) as Record<string, string>;
    },
  });

  const uploadImage = async (key: string, label: string, file: File | null) => {
    if (!file || !supabase) return;
    setUploadingKey(key);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${key}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("site-images")
      .upload(path, file, { upsert: false });
    if (upErr) {
      setUploadingKey(null);
      toast.error(upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from("site-images").getPublicUrl(path);
    const { error: dbErr } = await supabase
      .from("site_images")
      .upsert({ key, label, url: pub.publicUrl, updated_at: new Date().toISOString() });
    setUploadingKey(null);
    if (dbErr) {
      toast.error(dbErr.message);
      return;
    }
    toast.success("Image updated");
    qc.invalidateQueries({ queryKey: ["site-images"] });
    refetch();
  };

  const clearImage = async (key: string) => {
    if (!confirm("Remove this override? The site will use its built-in default image.") || !supabase) return;
    const { error } = await supabase.from("site_images").delete().eq("key", key);
    if (error) { toast.error(error.message); return; }
    toast.success("Override removed");
    qc.invalidateQueries({ queryKey: ["site-images"] });
    refetch();
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Upload a replacement for any built-in image. The original image stays on the site until you upload an override.
        Clicking "Clear override" reverts that slot back to the original.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SITE_IMAGE_SLOTS.map((slot) => (
          <div key={slot.key} className="card-nature p-4 rounded-xl space-y-3">
            <div>
              <p className="font-medium text-sm text-foreground">{slot.label}</p>
              {slot.hint && <p className="text-xs text-muted-foreground mt-0.5">{slot.hint}</p>}
            </div>

            <div className="relative w-full h-28 rounded-lg overflow-hidden bg-muted flex items-center justify-center border border-border/40">
              {currentImages[slot.key] ? (
                <img
                  src={currentImages[slot.key]}
                  alt={slot.label}
                  className="w-full h-full object-cover"
                />
              ) : (
                <p className="text-xs text-muted-foreground">Using site default</p>
              )}
            </div>

            {currentImages[slot.key] && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive text-xs h-7 px-2"
                onClick={() => clearImage(slot.key)}
              >
                <Trash2 className="w-3 h-3 mr-1" /> Clear override
              </Button>
            )}

            <div>
              <Label className="text-xs text-muted-foreground">
                {currentImages[slot.key] ? "Replace image" : "Upload image"}
              </Label>
              <Input
                className="mt-1"
                type="file"
                accept="image/*"
                disabled={uploadingKey === slot.key}
                onChange={(e) => {
                  const el = e.target;
                  uploadImage(slot.key, slot.label, el.files?.[0] ?? null).then(() => { el.value = ""; });
                }}
              />
              {uploadingKey === slot.key && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Uploading…
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const RESOURCE_YEARS = ["L100", "L200", "L300", "L400"] as const;
const RESOURCE_SEMESTERS = ["1st", "2nd"] as const;

type ResourceRow = {
  id: string;
  year: string;
  semester: string;
  label: string;
  drive_url: string;
  display_order: number;
};

const RESOURCE_YEAR_ORDER: Record<string, number> = { L100: 0, L200: 1, L300: 2, L400: 3 };
const RESOURCE_SEM_ORDER: Record<string, number> = { "1st": 0, "2nd": 1 };

function sortResourceRows(arr: ResourceRow[]): ResourceRow[] {
  return [...arr].sort((a, b) => {
    const y = (RESOURCE_YEAR_ORDER[a.year] ?? 99) - (RESOURCE_YEAR_ORDER[b.year] ?? 99);
    if (y !== 0) return y;
    const s = (RESOURCE_SEM_ORDER[a.semester] ?? 99) - (RESOURCE_SEM_ORDER[b.semester] ?? 99);
    if (s !== 0) return s;
    return a.display_order - b.display_order;
  });
}

function ResourcesAdminPanel() {
  const qc = useQueryClient();

  const { data: rows = [], refetch } = useQuery({
    queryKey: ["admin-resources"],
    queryFn: async (): Promise<ResourceRow[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("resources")
        .select("*");
      if (error) throw error;
      return (data ?? []) as ResourceRow[];
    },
  });

  const sorted = sortResourceRows(rows);

  // Add form
  const [year, setYear] = useState<string>("L100");
  const [semester, setSemester] = useState<string>("1st");
  const [label, setLabel] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [adding, setAdding] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editYear, setEditYear] = useState("");
  const [editSemester, setEditSemester] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editDriveUrl, setEditDriveUrl] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["public-resources"] });
    refetch();
  };

  const startEdit = (row: ResourceRow) => {
    setEditingId(row.id);
    setEditYear(row.year);
    setEditSemester(row.semester);
    setEditLabel(row.label);
    setEditDriveUrl(row.drive_url);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAdding(true);
    const nextOrder = rows.length > 0 ? Math.max(...rows.map((r) => r.display_order)) + 1 : 0;
    const { error } = await supabase.from("resources").insert({
      year, semester, label: label.trim(), drive_url: driveUrl.trim(), display_order: nextOrder,
    });
    setAdding(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Resource added");
    setLabel(""); setDriveUrl("");
    invalidate();
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !editingId) return;
    setEditSaving(true);
    const { error } = await supabase.from("resources").update({
      year: editYear, semester: editSemester,
      label: editLabel.trim(), drive_url: editDriveUrl.trim(),
    }).eq("id", editingId);
    setEditSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Updated");
    setEditingId(null);
    invalidate();
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this resource?") || !supabase) return;
    const { error } = await supabase.from("resources").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed");
    invalidate();
  };

  // Move within same year+semester group
  const move = async (id: string, direction: "up" | "down") => {
    if (!supabase) return;
    const row = sorted.find((r) => r.id === id);
    if (!row) return;
    const group = sorted.filter((r) => r.year === row.year && r.semester === row.semester);
    const gi = group.findIndex((r) => r.id === id);
    const swapGi = direction === "up" ? gi - 1 : gi + 1;
    if (swapGi < 0 || swapGi >= group.length) return;
    const swap = group[swapGi];
    await Promise.all([
      supabase.from("resources").update({ display_order: swap.display_order }).eq("id", row.id),
      supabase.from("resources").update({ display_order: row.display_order }).eq("id", swap.id),
    ]);
    invalidate();
  };

  return (
    <div className="space-y-8">
      <section className="card-nature p-6 rounded-2xl space-y-4">
        <h2 className="font-display text-lg font-semibold">Add a Google Drive folder</h2>
        <p className="text-sm text-muted-foreground">
          Each entry appears as a card on the public Resources page, filtered by year and semester.
          Resources are displayed L100 → L400, 1st → 2nd semester. Use the arrows to reorder within a group.
        </p>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Year</Label>
            <select
              className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              {RESOURCE_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <Label>Semester</Label>
            <select
              className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            >
              {RESOURCE_SEMESTERS.map((s) => <option key={s} value={s}>{s} Semester</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label>Label (shown on the card)</Label>
            <Input className="mt-1" value={label} onChange={(e) => setLabel(e.target.value)} required placeholder="e.g. L100 1st Semester Study Materials" />
          </div>
          <div className="sm:col-span-2">
            <Label>Google Drive URL</Label>
            <Input className="mt-1" type="url" value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} required placeholder="https://drive.google.com/drive/folders/..." />
          </div>
          <Button type="submit" disabled={adding} className="sm:col-span-2 w-full sm:w-auto">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add resource"}
          </Button>
        </form>
      </section>

      <section>
        <h3 className="font-medium mb-3">Current resources ({sorted.length})</h3>
        <ul className="space-y-2">
          {sorted.map((row) => {
            const group = sorted.filter((r) => r.year === row.year && r.semester === row.semester);
            const gi = group.findIndex((r) => r.id === row.id);
            return editingId === row.id ? (
              <li key={row.id} className="card-nature p-4 rounded-xl border-2 border-primary/20">
                <form onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Year</Label>
                    <select
                      className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={editYear}
                      onChange={(e) => setEditYear(e.target.value)}
                    >
                      {RESOURCE_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Semester</Label>
                    <select
                      className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={editSemester}
                      onChange={(e) => setEditSemester(e.target.value)}
                    >
                      {RESOURCE_SEMESTERS.map((s) => <option key={s} value={s}>{s} Semester</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Label</Label>
                    <Input className="mt-1" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} required />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Google Drive URL</Label>
                    <Input className="mt-1" type="url" value={editDriveUrl} onChange={(e) => setEditDriveUrl(e.target.value)} required />
                  </div>
                  <div className="sm:col-span-2 flex gap-2">
                    <Button type="submit" size="sm" disabled={editSaving}>
                      {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={row.id} className="flex flex-wrap items-center gap-2 card-nature p-3 rounded-xl text-sm">
                {/* Reorder arrows — only active within same year+semester group */}
                <div className="flex flex-col gap-0.5">
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-5 w-5 text-muted-foreground disabled:opacity-20"
                    disabled={gi === 0}
                    onClick={() => move(row.id, "up")}
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-5 w-5 text-muted-foreground disabled:opacity-20"
                    disabled={gi === group.length - 1}
                    onClick={() => move(row.id, "down")}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{row.year}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{row.semester} Sem</span>
                <span className="flex-1 font-medium">{row.label}</span>
                <a href={row.drive_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                  <ExternalLink className="w-3 h-3" /> View
                </a>
                <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={() => startEdit(row)}>
                  Edit
                </Button>
                <Button type="button" variant="ghost" size="icon" className="text-destructive h-7 w-7" onClick={() => remove(row.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

const RESEARCH_CATEGORIES = ["Paper", "Thesis", "Project", "Report", "Poster", "Abstract", "Other"] as const;

function ResearchAdminPanel({ userId }: { userId: string }) {
  const qc = useQueryClient();

  const { data: lecturers = [], refetch: refetchLecturers } = useQuery({
    queryKey: ["admin-lecturers"],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("lecturers").select("*").order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LecturerRow[];
    },
  });

  const { data: works = [], refetch: refetchWorks } = useQuery({
    queryKey: ["admin-research-works"],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("research_works").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ResearchWorkRow[];
    },
  });

  const onLecturerSaved = () => {
    qc.invalidateQueries({ queryKey: ["lecturers"] });
    refetchLecturers();
  };

  const onLecturerDeleted = onLecturerSaved;

  // Add lecturer form state
  const [newName, setNewName] = useState("");
  const [newBio, setNewBio] = useState("");
  const [newInterests, setNewInterests] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newLinks, setNewLinks] = useState<LecturerLink[]>([]);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newSaving, setNewSaving] = useState(false);
  const [showAddLecturer, setShowAddLecturer] = useState(false);

  const addLecturer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setNewSaving(true);
    let imageUrl: string | null = null;
    if (newFile) {
      const ext = newFile.name.split(".").pop() || "jpg";
      const path = `${userId}/new-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("lecturer-images").upload(path, newFile, { upsert: false });
      if (upErr) { setNewSaving(false); toast.error(upErr.message); return; }
      imageUrl = supabase.storage.from("lecturer-images").getPublicUrl(path).data.publicUrl;
    }
    const interestList = newInterests.split(",").map((t) => t.trim()).filter(Boolean);
    const nextOrder = lecturers.length > 0 ? Math.max(...lecturers.map((l) => l.display_order)) + 1 : 0;
    const { error } = await supabase.from("lecturers").insert({
      name: newName.trim(),
      bio: newBio.trim() || null,
      research_interests: interestList,
      email: newEmail.trim() || null,
      image_url: imageUrl,
      display_order: nextOrder,
      is_active: true,
      links: newLinks.filter((l) => l.label.trim() && l.url.trim()),
    });
    setNewSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${newName} added`);
    setNewName(""); setNewBio(""); setNewInterests(""); setNewEmail(""); setNewLinks([]); setNewFile(null);
    setShowAddLecturer(false);
    onLecturerSaved();
  };

  const approveWork = async (id: string, publish: boolean) => {
    if (!supabase) return;
    const { error } = await supabase.from("research_works").update({ is_published: publish }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      qc.invalidateQueries({ queryKey: ["research-works-public"] });
      refetchWorks();
    }
  };

  const removeWork = async (id: string) => {
    if (!confirm("Delete this submission?") || !supabase) return;
    await supabase.from("research_works").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["research-works-public"] });
    refetchWorks();
  };

  const [editWorkId, setEditWorkId] = useState<string | null>(null);
  const [ewTitle, setEwTitle] = useState("");
  const [ewAuthorName, setEwAuthorName] = useState("");
  const [ewAuthorType, setEwAuthorType] = useState("student");
  const [ewCategory, setEwCategory] = useState("Paper");
  const [ewAbstract, setEwAbstract] = useState("");
  const [ewYear, setEwYear] = useState("");
  const [ewLinkUrl, setEwLinkUrl] = useState("");
  const [ewTags, setEwTags] = useState("");
  const [ewFile, setEwFile] = useState<File | null>(null);
  const [ewSaving, setEwSaving] = useState(false);

  const startEditWork = (w: ResearchWorkRow) => {
    setEditWorkId(w.id);
    setEwTitle(w.title);
    setEwAuthorName(w.author_name);
    setEwAuthorType(w.author_type);
    setEwCategory(w.category);
    setEwAbstract(w.abstract ?? "");
    setEwYear(w.year ? String(w.year) : "");
    setEwLinkUrl(w.link_url ?? "");
    setEwTags((w.tags ?? []).join(", "));
    setEwFile(null);
  };

  const saveEditWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !editWorkId) return;
    setEwSaving(true);
    const patch: Record<string, unknown> = {
      title: ewTitle.trim(),
      author_name: ewAuthorName.trim(),
      author_type: ewAuthorType,
      category: ewCategory,
      abstract: ewAbstract.trim() || null,
      year: ewYear ? parseInt(ewYear, 10) : null,
      link_url: ewLinkUrl.trim() || null,
      tags: ewTags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    if (ewFile) {
      const ext = ewFile.name.split(".").pop() || "pdf";
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("research-files").upload(path, ewFile, { upsert: false });
      if (upErr) { setEwSaving(false); toast.error(upErr.message); return; }
      patch.file_url = supabase.storage.from("research-files").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase.from("research_works").update(patch).eq("id", editWorkId);
    setEwSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Work updated");
    setEditWorkId(null);
    qc.invalidateQueries({ queryKey: ["research-works-public"] });
    refetchWorks();
  };

  const [title, setTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [authorType, setAuthorType] = useState("student");
  const [category, setCategory] = useState("Paper");
  const [abstract, setAbstract] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [linkUrl, setLinkUrl] = useState("");
  const [tags, setTags] = useState("");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addSaving, setAddSaving] = useState(false);

  const addWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAddSaving(true);
    let fileUrl: string | null = null;
    if (addFile) {
      const ext = addFile.name.split(".").pop() || "pdf";
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("research-files").upload(path, addFile, { upsert: false });
      if (upErr) { setAddSaving(false); toast.error(upErr.message); return; }
      fileUrl = supabase.storage.from("research-files").getPublicUrl(path).data.publicUrl;
    }
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    const { error } = await supabase.from("research_works").insert({
      title: title.trim(),
      author_name: authorName.trim(),
      author_type: authorType,
      category,
      abstract: abstract.trim() || null,
      year: year ? parseInt(year, 10) : null,
      link_url: linkUrl.trim() || null,
      file_url: fileUrl,
      tags: tagList,
      is_published: true,
    });
    setAddSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Work added and published");
    setTitle(""); setAuthorName(""); setAbstract(""); setLinkUrl(""); setTags(""); setAddFile(null);
    qc.invalidateQueries({ queryKey: ["research-works-public"] });
    refetchWorks();
  };

  const pending = works.filter((w) => !w.is_published);
  const publishedWorks = works.filter((w) => w.is_published);

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Lecturer profiles</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Edit each lecturer's bio, research interests, email, and photo. Use the trash icon to remove a profile.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAddLecturer((v) => !v)}
          >
            {showAddLecturer ? "Cancel" : "+ Add lecturer"}
          </Button>
        </div>

        {showAddLecturer && (
          <div className="card-nature p-5 rounded-2xl border-2 border-primary/20">
            <p className="font-display font-semibold text-foreground mb-4">New lecturer</p>
            <form onSubmit={addLecturer} className="space-y-3">
              <div>
                <Label>Full name</Label>
                <Input className="mt-1" value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="e.g. Dr. Ama Owusu" />
              </div>
              <div>
                <Label>Bio</Label>
                <Textarea className="mt-1" rows={2} value={newBio} onChange={(e) => setNewBio(e.target.value)} placeholder="Short biography." />
              </div>
              <div>
                <Label>Research interests (comma-separated)</Label>
                <Input className="mt-1" value={newInterests} onChange={(e) => setNewInterests(e.target.value)} placeholder="Wildlife ecology, Herpetology" />
              </div>
              <div>
                <Label>Email</Label>
                <Input className="mt-1" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </div>
              <div>
                <Label>Links (optional)</Label>
                <div className="mt-1.5 space-y-2">
                  {newLinks.map((link, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input
                        placeholder="Label (e.g. Google Scholar)"
                        value={link.label}
                        onChange={(e) => setNewLinks(newLinks.map((l, idx) => idx === i ? { ...l, label: e.target.value } : l))}
                        className="flex-1"
                      />
                      <Input
                        placeholder="https://..."
                        type="url"
                        value={link.url}
                        onChange={(e) => setNewLinks(newLinks.map((l, idx) => idx === i ? { ...l, url: e.target.value } : l))}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive shrink-0"
                        onClick={() => setNewLinks(newLinks.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setNewLinks([...newLinks, { label: "", url: "" }])}
                  >
                    + Add link
                  </Button>
                </div>
              </div>
              <div>
                <Label>Photo (optional)</Label>
                <Input className="mt-1" type="file" accept="image/*" onChange={(e) => setNewFile(e.target.files?.[0] ?? null)} />
              </div>
              <Button type="submit" size="sm" disabled={newSaving} className="w-full">
                {newSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add lecturer"}
              </Button>
            </form>
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lecturers.map((lec) => (
            <LecturerEditCard
              key={lec.id}
              lecturer={lec}
              userId={userId}
              onSaved={onLecturerSaved}
              onDeleted={onLecturerDeleted}
            />
          ))}
        </div>
      </section>

      <section className="card-nature p-6 rounded-2xl space-y-4">
        <h2 className="font-display text-lg font-semibold">Add a work entry</h2>
        <p className="text-sm text-muted-foreground">Adds directly as published (no review step).</p>
        <form onSubmit={addWork} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Title</Label>
            <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label>Author name</Label>
            <Input className="mt-1" value={authorName} onChange={(e) => setAuthorName(e.target.value)} required />
          </div>
          <div>
            <Label>Author type</Label>
            <Select value={authorType} onValueChange={setAuthorType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="graduate">Graduate / alumni</SelectItem>
                <SelectItem value="lecturer">Lecturer / researcher</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESEARCH_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Year</Label>
            <Input className="mt-1" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Abstract</Label>
            <Textarea className="mt-1" value={abstract} onChange={(e) => setAbstract(e.target.value)} />
          </div>
          <div>
            <Label>External link (optional)</Label>
            <Input className="mt-1" type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          </div>
          <div>
            <Label>Tags (comma-separated)</Label>
            <Input className="mt-1" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Conservation, Ghana" />
          </div>
          <div className="sm:col-span-2">
            <Label>Upload file (optional)</Label>
            <Input className="mt-1" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" onChange={(e) => setAddFile(e.target.files?.[0] ?? null)} />
          </div>
          <Button type="submit" disabled={addSaving} className="sm:col-span-2 w-full sm:w-auto">
            {addSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add & publish"}
          </Button>
        </form>
      </section>

      {pending.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold">
            Pending review
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-primary text-primary-foreground">{pending.length}</span>
          </h2>
          <ul className="space-y-4">
            {pending.map((w) => (
              <li key={w.id} className="card-nature rounded-xl text-sm border-l-4 border-amber-400 overflow-hidden">
                {/* Header strip */}
                <div className="flex flex-wrap items-start justify-between gap-2 p-4 pb-3">
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-semibold text-foreground leading-snug">{w.title}</p>
                    <p className="text-xs text-muted-foreground">
                      By <span className="text-foreground">{w.author_name}</span>
                      {" · "}
                      <span className="capitalize">{w.author_type.replace("-", " ")}</span>
                      {" · "}
                      <span className="font-medium text-primary">{w.category}</span>
                      {w.year ? ` · ${w.year}` : ""}
                      {" · submitted "}
                      {new Date(w.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => approveWork(w.id, true)}>
                      <Check className="w-3.5 h-3.5 text-primary" /> Approve
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => removeWork(w.id)}>
                      <XIcon className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Body */}
                <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                  {w.abstract ? (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Abstract</p>
                      <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{w.abstract}</p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic text-xs">No abstract provided.</p>
                  )}

                  {w.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {w.tags.map((tag) => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{tag}</span>
                      ))}
                    </div>
                  )}

                  {(w.link_url || w.file_url) && (
                    <div className="flex flex-wrap gap-3 pt-1">
                      {w.link_url && (
                        <a
                          href={w.link_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" /> View link
                        </a>
                      )}
                      {w.file_url && (
                        <a
                          href={w.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" /> Download file
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Published ({publishedWorks.length})</h2>
        <ul className="space-y-2">
          {publishedWorks.map((w) =>
            editWorkId === w.id ? (
              <li key={w.id} className="card-nature p-4 rounded-xl border-2 border-primary/20">
                <form onSubmit={saveEditWork} className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Title</Label>
                    <Input className="mt-1" value={ewTitle} onChange={(e) => setEwTitle(e.target.value)} required />
                  </div>
                  <div>
                    <Label className="text-xs">Author name</Label>
                    <Input className="mt-1" value={ewAuthorName} onChange={(e) => setEwAuthorName(e.target.value)} required />
                  </div>
                  <div>
                    <Label className="text-xs">Author type</Label>
                    <Select value={ewAuthorType} onValueChange={setEwAuthorType}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="graduate">Graduate / alumni</SelectItem>
                        <SelectItem value="lecturer">Lecturer / researcher</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Category</Label>
                    <Select value={ewCategory} onValueChange={setEwCategory}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RESEARCH_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Year</Label>
                    <Input className="mt-1" type="number" value={ewYear} onChange={(e) => setEwYear(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Abstract</Label>
                    <Textarea className="mt-1" value={ewAbstract} onChange={(e) => setEwAbstract(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">External link (optional)</Label>
                    <Input className="mt-1" type="url" value={ewLinkUrl} onChange={(e) => setEwLinkUrl(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Tags (comma-separated)</Label>
                    <Input className="mt-1" value={ewTags} onChange={(e) => setEwTags(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Replace file (optional)</Label>
                    <Input className="mt-1" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" onChange={(e) => setEwFile(e.target.files?.[0] ?? null)} />
                    {w.file_url && !ewFile && <p className="text-xs text-muted-foreground mt-1">Current file kept unless replaced.</p>}
                  </div>
                  <div className="sm:col-span-2 flex gap-2">
                    <Button type="submit" size="sm" disabled={ewSaving}>
                      {ewSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditWorkId(null)}>Cancel</Button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={w.id} className="flex flex-wrap items-center gap-3 card-nature p-3 rounded-xl text-sm">
                <span className="flex-1">
                  <span className="font-medium">{w.title}</span>
                  <span className="text-muted-foreground ml-2 text-xs">
                    {w.category}{w.year ? `, ${w.year}` : ""} — {w.author_name}
                  </span>
                </span>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => startEditWork(w)}>Edit</Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => approveWork(w.id, false)}>
                  Unpublish
                </Button>
                <Button type="button" variant="ghost" size="icon" className="text-destructive h-7 w-7" onClick={() => removeWork(w.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </li>
            )
          )}
        </ul>
      </section>
    </div>
  );
}

function NomineesAdminPanel() {
  const qc = useQueryClient();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfTitle, setPdfTitle] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedNominees, setParsedNominees] = useState<ParsedNominee[]>([]);
  const [selectedDefaultCategory, setSelectedDefaultCategory] = useState<string>("none");
  const [importing, setImporting] = useState(false);

  // Vote price management
  const { data: currentVotePrice = 1.0 } = useVotePrice();
  const updateVotePriceMutation = useUpdateVotePrice();
  const [votePriceInput, setVotePriceInput] = useState<number>(1.0);
  const [votePriceInitialized, setVotePriceInitialized] = useState(false);

  // USSD & Hubtel Settings
  const { data: ussdSettings } = useUssdSettings();
  const updateUssdMutation = useUpdateUssdSettings();
  const autoGenCodesMutation = useAutoGenerateNomineeCodes();
  const [ussdShortcode, setUssdShortcode] = useState("*713*22#");
  const [ussdEventCode, setUssdEventCode] = useState("22");
  const [ussdEnabled, setUssdEnabled] = useState(true);
  const [ussdInstructions, setUssdInstructions] = useState("");
  const [ussdInitialized, setUssdInitialized] = useState(false);

  useEffect(() => {
    if (currentVotePrice !== undefined && !votePriceInitialized) {
      setVotePriceInput(currentVotePrice);
      setVotePriceInitialized(true);
    }
  }, [currentVotePrice, votePriceInitialized]);

  useEffect(() => {
    if (ussdSettings && !ussdInitialized) {
      setUssdShortcode(ussdSettings.shortcode || "*713*22#");
      setUssdEventCode(ussdSettings.eventCode || "22");
      setUssdEnabled(ussdSettings.enabled);
      setUssdInstructions(ussdSettings.instructions || "");
      setUssdInitialized(true);
    }
  }, [ussdSettings, ussdInitialized]);

  // Category management
  const [newCatTitle, setNewCatTitle] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatTitle, setEditCatTitle] = useState("");
  const [editCatDesc, setEditCatDesc] = useState("");

  // Manual Nominee Addition & Editing
  const [manualName, setManualName] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [manualDept, setManualDept] = useState("");
  const [manualLevel, setManualLevel] = useState("");
  const [manualCatId, setManualCatId] = useState("none");
  const [manualBio, setManualBio] = useState("");
  const [addingNominee, setAddingNominee] = useState(false);

  const [editingNomineeId, setEditingNomineeId] = useState<string | null>(null);
  const [editNomineeName, setEditNomineeName] = useState("");
  const [editNomineeCode, setEditNomineeCode] = useState("");
  const [editNomineeDept, setEditNomineeDept] = useState("");
  const [editNomineeLevel, setEditNomineeLevel] = useState("");
  const [editNomineeCatId, setEditNomineeCatId] = useState("none");
  const [editNomineeBio, setEditNomineeBio] = useState("");
  const [editNomineeVotes, setEditNomineeVotes] = useState(0);

  // Queries
  const { data: categories = [], refetch: refetchCats } = useQuery<AwardCategory[]>({
    queryKey: ["admin-award-categories"],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("award_categories").select("*").order("display_order");
      if (error) throw error;
      return (data as AwardCategory[]) ?? [];
    },
    enabled: isSupabaseConfigured,
  });

  const { data: nominees = [], refetch: refetchNominees } = useQuery<NomineeRow[]>({
    queryKey: ["admin-nominees"],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("nominees").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as NomineeRow[]) ?? [];
    },
    enabled: isSupabaseConfigured,
  });

  const { data: pdfDocs = [], refetch: refetchPdfs } = useQuery<NomineePdfUpload[]>({
    queryKey: ["admin-nominee-pdfs"],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("nominee_pdf_uploads").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as NomineePdfUpload[]) ?? [];
    },
    enabled: isSupabaseConfigured,
  });

  const handleSaveVotePrice = (e: React.FormEvent) => {
    e.preventDefault();
    updateVotePriceMutation.mutate(Number(votePriceInput), {
      onSuccess: () => {
        toast.success(`Global vote price updated to ${formatGHS(Number(votePriceInput))} per vote!`);
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Failed to update vote price");
      },
    });
  };

  const handleSaveUssdSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateUssdMutation.mutate(
      {
        provider: "hubtel",
        shortcode: ussdShortcode.trim(),
        eventCode: ussdEventCode.trim(),
        enabled: ussdEnabled,
        instructions: ussdInstructions.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Hubtel USSD voting settings saved successfully!");
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Failed to save USSD settings");
        },
      }
    );
  };

  const handleAutoGenerateCodes = () => {
    autoGenCodesMutation.mutate(undefined, {
      onSuccess: (count) => {
        toast.success(`Generated candidate voting codes for ${count} nominees!`);
        refetchNominees();
        qc.invalidateQueries({ queryKey: ["nominees"] });
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Failed to generate codes");
      },
    });
  };

  const startEditNominee = (n: NomineeRow) => {
    setEditingNomineeId(n.id);
    setEditNomineeName(n.name);
    setEditNomineeCode(n.nominee_code || "");
    setEditNomineeDept(n.department || "");
    setEditNomineeLevel(n.level || "");
    setEditNomineeCatId(n.category_id || "none");
    setEditNomineeBio(n.bio || "");
    setEditNomineeVotes(n.votes_count);
  };

  const handleSaveNomineeEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !editingNomineeId) return;

    const { error } = await supabase
      .from("nominees")
      .update({
        name: editNomineeName.trim(),
        nominee_code: editNomineeCode.trim() || null,
        department: editNomineeDept.trim() || null,
        level: editNomineeLevel.trim() || null,
        category_id: editNomineeCatId !== "none" ? editNomineeCatId : null,
        bio: editNomineeBio.trim() || "",
        votes_count: editNomineeVotes,
      })
      .eq("id", editingNomineeId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Nominee updated successfully!");
      setEditingNomineeId(null);
      refetchNominees();
      qc.invalidateQueries({ queryKey: ["nominees"] });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfFile(file);
    if (!pdfTitle) {
      setPdfTitle(file.name.replace(/\.pdf$/i, ""));
    }

    setParsing(true);
    try {
      const res = await parsePDFNomineeFile(file);
      setParsedNominees(res.nominees);
      toast.success(`Extracted ${res.nominees.length} nominees across ${res.categories.length} award categories!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse PDF file");
    } finally {
      setParsing(false);
    }
  };

  const handleUpdateParsedItem = (id: string, field: keyof ParsedNominee, val: string) => {
    setParsedNominees((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
  };

  const handleRemoveParsedItem = (id: string) => {
    setParsedNominees((prev) => prev.filter((item) => item.id !== id));
  };

  const handleAddParsedRow = () => {
    setParsedNominees((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "",
        department: "",
        level: "",
        bio: "",
        category: selectedDefaultCategory !== "none" ? selectedDefaultCategory : "",
      },
    ]);
  };

  const handleBulkImport = async () => {
    if (!supabase) return;
    if (parsedNominees.length === 0) {
      toast.error("No nominees to import.");
      return;
    }

    setImporting(true);
    try {
      let fileUrl = "";
      if (pdfFile) {
        const cleanName = pdfFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${Date.now()}_${cleanName}`;
        try {
          const { error: upErr } = await supabase.storage
            .from("nominee-documents")
            .upload(path, pdfFile, { upsert: false });

          if (!upErr) {
            const { data: pubData } = supabase.storage
              .from("nominee-documents")
              .getPublicUrl(path);
            fileUrl = pubData.publicUrl;

            await supabase.from("nominee_pdf_uploads").insert({
              filename: pdfFile.name,
              file_url: fileUrl,
              title: pdfTitle || pdfFile.name,
              parsed_count: parsedNominees.length,
            });
          }
        } catch (storageErr) {
          console.warn("Storage upload notice:", storageErr);
        }
      }

      // 1. Ensure all categories from the PDF exist in award_categories
      const uniqueCategoryNames = Array.from(
        new Set(
          parsedNominees
            .map((n) => n.category?.trim())
            .filter((c): c is string => Boolean(c && c.length > 0))
        )
      );

      // Fetch current categories from database
      const { data: existingCatsData } = await supabase
        .from("award_categories")
        .select("id, title");

      const existingMap = new Map<string, string>();
      (existingCatsData || []).forEach((c) => {
        existingMap.set(c.title.toLowerCase().trim(), c.id);
      });

      // Auto-create any missing categories
      const missingCategories = uniqueCategoryNames.filter(
        (name) => !existingMap.has(name.toLowerCase().trim())
      );

      let createdCategoriesCount = 0;
      if (missingCategories.length > 0) {
        const catRows = missingCategories.map((name, index) => ({
          title: name,
          description: `Nominees for ${name}`,
          vote_price_ghs: currentVotePrice > 0 ? currentVotePrice : 1.0,
          is_active: true,
          display_order: existingMap.size + index,
        }));

        const { data: newCats, error: catErr } = await supabase
          .from("award_categories")
          .insert(catRows)
          .select("id, title");

        if (catErr) {
          console.warn("Could not auto-create some categories:", catErr);
        } else if (newCats) {
          createdCategoriesCount = newCats.length;
          newCats.forEach((c) => {
            existingMap.set(c.title.toLowerCase().trim(), c.id);
          });
        }
      }

      // 2. Map nominees with resolved category IDs and sequential nominee codes
      let nextCode = 100;
      nominees.forEach((n) => {
        const num = parseInt(n.nominee_code || "", 10);
        if (!isNaN(num) && num > nextCode) nextCode = num;
      });

      const rowsToInsert = parsedNominees.map((n) => {
        let categoryId: string | null = null;
        if (selectedDefaultCategory && selectedDefaultCategory !== "none") {
          categoryId = selectedDefaultCategory;
        } else if (n.category) {
          const matchId = existingMap.get(n.category.toLowerCase().trim());
          if (matchId) categoryId = matchId;
        }

        nextCode += 1;

        return {
          name: n.name.trim(),
          nominee_code: nextCode.toString(),
          department: n.department ? n.department.trim() : null,
          level: n.level ? n.level.trim() : null,
          bio: n.bio ? n.bio.trim() : "",
          category_id: categoryId,
          source_pdf_url: fileUrl || null,
          is_published: true,
        };
      });

      // Insert nominees in chunks of 50
      const chunkSize = 50;
      for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
        const chunk = rowsToInsert.slice(i, i + chunkSize);
        const { error: insErr } = await supabase.from("nominees").insert(chunk);
        if (insErr) throw insErr;
      }

      toast.success(
        `Successfully imported ${rowsToInsert.length} nominees${
          createdCategoriesCount > 0 ? ` and created ${createdCategoriesCount} new categories` : ""
        }!`
      );
      setParsedNominees([]);
      setPdfFile(null);
      setPdfTitle("");
      refetchCats();
      refetchNominees();
      refetchPdfs();
      qc.invalidateQueries({ queryKey: ["award-categories"] });
      qc.invalidateQueries({ queryKey: ["nominees"] });
      qc.invalidateQueries({ queryKey: ["nominee-pdfs"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !newCatTitle.trim()) return;
    setAddingCat(true);
    try {
      const { error } = await supabase.from("award_categories").insert({
        title: newCatTitle.trim(),
        description: newCatDesc.trim() || null,
        display_order: categories.length,
      });
      if (error) throw error;
      toast.success("Category added successfully!");
      setNewCatTitle("");
      setNewCatDesc("");
      refetchCats();
      qc.invalidateQueries({ queryKey: ["award-categories"] });
    } catch (err: unknown) {
      const msg = typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) : "Failed to add category";
      toast.error(`Category creation error: ${msg}`);
    } finally {
      setAddingCat(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!supabase || !confirm("Delete this category? Nominees under it will remain uncategorized.")) return;
    const { error } = await supabase.from("award_categories").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Category deleted");
      refetchCats();
      qc.invalidateQueries({ queryKey: ["award-categories"] });
    }
  };

  const handleAddNomineeManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !manualName.trim()) return;
    setAddingNominee(true);
    try {
      const { error } = await supabase.from("nominees").insert({
        name: manualName.trim(),
        nominee_code: manualCode.trim() || null,
        department: manualDept.trim() || null,
        level: manualLevel.trim() || null,
        category_id: manualCatId !== "none" ? manualCatId : null,
        bio: manualBio.trim() || "",
        is_published: true,
      });
      if (error) throw error;
      toast.success("Nominee added successfully!");
      setManualName("");
      setManualCode("");
      setManualDept("");
      setManualLevel("");
      setManualBio("");
      setManualCatId("none");
      refetchNominees();
      qc.invalidateQueries({ queryKey: ["nominees"] });
    } catch (err: unknown) {
      const msg = typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) : "Failed to add nominee";
      toast.error(`Nominee addition error: ${msg}`);
    } finally {
      setAddingNominee(false);
    }
  };

  const handleDeleteNominee = async (id: string) => {
    if (!supabase || !confirm("Delete this nominee?")) return;
    const { error } = await supabase.from("nominees").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Nominee deleted");
      refetchNominees();
      qc.invalidateQueries({ queryKey: ["nominees"] });
    }
  };

  const handleTogglePublishNominee = async (id: string, currentStatus: boolean) => {
    if (!supabase) return;
    const { error } = await supabase.from("nominees").update({ is_published: !currentStatus }).eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(currentStatus ? "Unpublished" : "Published");
      refetchNominees();
      qc.invalidateQueries({ queryKey: ["nominees"] });
    }
  };

  const handleDeletePdfDoc = async (id: string) => {
    if (!supabase || !confirm("Delete this PDF document record?")) return;
    const { error } = await supabase.from("nominee_pdf_uploads").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("PDF document deleted");
      refetchPdfs();
      qc.invalidateQueries({ queryKey: ["nominee-pdfs"] });
    }
  };

  return (
    <div className="space-y-8">
      {/* 0. Vote Price Configuration Card */}
      <section className="bg-card border border-border/60 p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            <h3 className="text-lg font-bold text-foreground">Award Vote Price Configuration</h3>
          </div>
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            Active Price: {formatGHS(currentVotePrice)} / vote
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure the price per vote (GHS) charged during voting. Setting the price to 0.00 allows free voting.
        </p>

        <form onSubmit={handleSaveVotePrice} className="flex flex-wrap items-end gap-3 pt-2">
          <div className="w-48">
            <Label className="text-xs font-semibold">Price per Vote (GHS)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={votePriceInput}
              onChange={(e) => setVotePriceInput(Number(e.target.value))}
              className="mt-1 font-bold text-sm"
              required
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={updateVotePriceMutation.isPending}
            className="text-xs font-semibold gap-1.5"
          >
            {updateVotePriceMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save Vote Price
          </Button>
        </form>
      </section>

      {/* 0b. Hubtel USSD Voting Configuration Card */}
      <section className="bg-card border border-border/60 p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="text-lg font-bold text-foreground">USSD Voting Configuration (Hubtel *713#)</h3>
              <p className="text-xs text-muted-foreground">
                Configure telecom shortcodes for USSD dial voting across MTN MoMo, Telecel Cash, and AT Money.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={autoGenCodesMutation.isPending}
              onClick={handleAutoGenerateCodes}
              className="text-xs font-semibold gap-1.5"
            >
              {autoGenCodesMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Hash className="w-3.5 h-3.5 text-primary" />
              )}
              Auto-Assign Nominee Codes
            </Button>
          </div>
        </div>

        <form onSubmit={handleSaveUssdSettings} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-semibold">USSD Shortcode</Label>
              <Input
                className="mt-1 font-mono font-bold text-sm"
                placeholder="e.g. *713*22#"
                value={ussdShortcode}
                onChange={(e) => setUssdShortcode(e.target.value)}
                required
              />
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                The master code voters dial on their phones.
              </span>
            </div>

            <div>
              <Label className="text-xs font-semibold">Event / Merchant Extension</Label>
              <Input
                className="mt-1 font-mono text-sm"
                placeholder="e.g. 22"
                value={ussdEventCode}
                onChange={(e) => setUssdEventCode(e.target.value)}
              />
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                Your Hubtel assigned event or POS code.
              </span>
            </div>

            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-2 pt-2">
                <Switch
                  id="ussd-enabled-toggle"
                  checked={ussdEnabled}
                  onCheckedChange={setUssdEnabled}
                />
                <Label htmlFor="ussd-enabled-toggle" className="text-xs font-semibold cursor-pointer">
                  {ussdEnabled ? "USSD Voting Active" : "USSD Voting Disabled"}
                </Label>
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 block">
                Controls USSD display across candidate cards and voting banners.
              </span>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">USSD Instructions (Displayed to Voters)</Label>
            <Textarea
              className="mt-1 text-xs"
              rows={3}
              value={ussdInstructions}
              onChange={(e) => setUssdInstructions(e.target.value)}
              placeholder="Step 1. Dial *713*22# on any network..."
            />
          </div>

          {/* Hubtel Webhook / USSD URL Box */}
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <PhoneCall className="w-3.5 h-3.5 text-emerald-500" /> Hubtel USSD / Webhook URL (Paste in Hubtel Portal)
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] font-semibold gap-1 text-primary"
                onClick={() => {
                  const url = `${window.location.origin}/functions/v1/hubtel-ussd-webhook`;
                  navigator.clipboard.writeText(url);
                  toast.success("Copied Hubtel USSD webhook URL!");
                }}
              >
                <Copy className="w-3 h-3" /> Copy URL
              </Button>
            </div>
            <code className="text-[11px] font-mono text-muted-foreground block select-all bg-background p-2 rounded border border-border/40">
              {window.location.origin}/functions/v1/hubtel-ussd-webhook
            </code>
            <p className="text-[10px] text-muted-foreground">
              Handles both Hubtel Programmable USSD interactive menus and incoming payment notifications.
            </p>
          </div>

          <Button
            type="submit"
            size="sm"
            disabled={updateUssdMutation.isPending}
            className="text-xs font-semibold gap-1.5"
          >
            {updateUssdMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save USSD Settings
          </Button>
        </form>
      </section>

      {/* 1. PDF Upload & Auto-Parsing Section */}
      <section className="bg-card border border-border/60 p-6 rounded-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">Import Nominees from PDF</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Upload an official nominee list document (.pdf). The system will extract nominee names, departments, levels, and citations into an editable table before bulk importing.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <Label className="text-xs">Document Title</Label>
            <Input
              className="mt-1"
              placeholder="e.g. 2026 Official ABCOSSA Awards Nominees"
              value={pdfTitle}
              onChange={(e) => setPdfTitle(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs">Select PDF File</Label>
            <Input
              className="mt-1"
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
            />
          </div>
        </div>

        {parsing && (
          <div className="flex items-center gap-2 text-sm text-primary py-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Parsing PDF text and table entries...</span>
          </div>
        )}

        {/* Parsed Table Preview */}
        {parsedNominees.length > 0 && (
          <div className="mt-6 space-y-4 border-t border-border/60 pt-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <h4 className="font-semibold text-sm">Extracted Nominees Preview ({parsedNominees.length})</h4>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Apply Category to all:</Label>
                  <Select value={selectedDefaultCategory} onValueChange={setSelectedDefaultCategory}>
                    <SelectTrigger className="h-8 text-xs w-48">
                      <SelectValue placeholder="Select Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Uncategorized</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleAddParsedRow} className="text-xs">
                  + Add Row
                </Button>
                <Button type="button" size="sm" disabled={importing} onClick={handleBulkImport} className="text-xs font-semibold">
                  {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                  Import {parsedNominees.length} Nominees
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto border border-border/60 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-2.5 min-w-[180px]">Category</th>
                    <th className="p-2.5 min-w-[160px]">Name</th>
                    <th className="p-2.5">Department</th>
                    <th className="p-2.5">Level</th>
                    <th className="p-2.5">Bio / Citation</th>
                    <th className="p-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {parsedNominees.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/20">
                      <td className="p-2">
                        <Input
                          className="h-8 text-xs font-semibold text-primary"
                          value={item.category}
                          placeholder="Category name"
                          onChange={(e) => handleUpdateParsedItem(item.id, "category", e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          className="h-8 text-xs font-medium"
                          value={item.name}
                          onChange={(e) => handleUpdateParsedItem(item.id, "name", e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          className="h-8 text-xs"
                          value={item.department}
                          onChange={(e) => handleUpdateParsedItem(item.id, "department", e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          className="h-8 text-xs w-20"
                          value={item.level}
                          onChange={(e) => handleUpdateParsedItem(item.id, "level", e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          className="h-8 text-xs"
                          value={item.bio}
                          onChange={(e) => handleUpdateParsedItem(item.id, "bio", e.target.value)}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleRemoveParsedItem(item.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* 2. Uploaded PDF Documents Manager */}
      <section className="bg-card border border-border/60 p-6 rounded-2xl space-y-4">
        <h3 className="text-lg font-bold text-foreground">Hosted PDF Nominee Documents</h3>
        {pdfDocs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No PDF documents uploaded yet.</p>
        ) : (
          <div className="divide-y divide-border/40 border border-border/60 rounded-xl overflow-hidden">
            {pdfDocs.map((doc) => (
              <div key={doc.id} className="p-3 bg-background flex items-center justify-between text-xs">
                <div>
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
                    {doc.title}
                  </a>
                  <span className="text-muted-foreground ml-2">({doc.filename} — {doc.parsed_count} candidates)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{new Date(doc.created_at).toLocaleDateString()}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeletePdfDoc(doc.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Award Categories & Manual Nominee Entry */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Categories */}
        <section className="bg-card border border-border/60 p-6 rounded-2xl space-y-4">
          <h3 className="text-base font-bold text-foreground">Award Categories</h3>
          <form onSubmit={handleAddCategory} className="space-y-3">
            <div>
              <Label className="text-xs">Category Title</Label>
              <Input className="mt-1" placeholder="e.g. Student of the Year" value={newCatTitle} onChange={(e) => setNewCatTitle(e.target.value)} required />
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Input className="mt-1" placeholder="Brief description" value={newCatDesc} onChange={(e) => setNewCatDesc(e.target.value)} />
            </div>
            <Button type="submit" size="sm" disabled={addingCat} className="text-xs">
              {addingCat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "+ Create Category"}
            </Button>
          </form>

          <div className="space-y-2 pt-2">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-muted/20 text-xs">
                <div>
                  <span className="font-semibold text-foreground">{c.title}</span>
                  {c.description && <p className="text-[11px] text-muted-foreground">{c.description}</p>}
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteCategory(c.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* Add Individual Nominee */}
        <section className="bg-card border border-border/60 p-6 rounded-2xl space-y-4">
          <h3 className="text-base font-bold text-foreground">Add Nominee Manually</h3>
          <form onSubmit={handleAddNomineeManual} className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label className="text-xs">Nominee Full Name</Label>
                <Input className="mt-1" placeholder="e.g. Ama Serwaa" value={manualName} onChange={(e) => setManualName(e.target.value)} required />
              </div>
              <div>
                <Label className="text-xs">USSD Code (e.g. 104)</Label>
                <Input className="mt-1 font-mono text-xs" placeholder="e.g. 104" value={manualCode} onChange={(e) => setManualCode(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Department</Label>
                <Input className="mt-1" placeholder="e.g. Biochemistry" value={manualDept} onChange={(e) => setManualDept(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Level</Label>
                <Input className="mt-1" placeholder="e.g. L300" value={manualLevel} onChange={(e) => setManualLevel(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Award Category</Label>
              <Select value={manualCatId} onValueChange={setManualCatId}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorized</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Bio / Citation</Label>
              <Textarea className="mt-1 text-xs" rows={2} placeholder="Reason for nomination" value={manualBio} onChange={(e) => setManualBio(e.target.value)} />
            </div>
            <Button type="submit" size="sm" disabled={addingNominee} className="text-xs">
              {addingNominee ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save Nominee"}
            </Button>
          </form>
        </section>
      </div>

      {/* 4. Nominees List Table & Editor */}
      <section className="bg-card border border-border/60 p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground">Published Nominees ({nominees.length})</h3>
        </div>

        {nominees.length === 0 ? (
          <p className="text-xs text-muted-foreground">No nominees added yet.</p>
        ) : (
          <div className="divide-y divide-border/40 border border-border/60 rounded-xl overflow-hidden">
            {nominees.map((n) => {
              const catObj = categories.find((c) => c.id === n.category_id);
              const isEditing = editingNomineeId === n.id;

              if (isEditing) {
                return (
                  <form key={n.id} onSubmit={handleSaveNomineeEdit} className="p-4 bg-muted/30 space-y-3 text-xs">
                    <h4 className="font-bold text-foreground">Edit Nominee Profile</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <Label className="text-xs">Full Name</Label>
                        <Input className="mt-1 text-xs" value={editNomineeName} onChange={(e) => setEditNomineeName(e.target.value)} required />
                      </div>
                      <div>
                        <Label className="text-xs">USSD Code</Label>
                        <Input className="mt-1 text-xs font-mono font-bold" placeholder="e.g. 104" value={editNomineeCode} onChange={(e) => setEditNomineeCode(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Award Category</Label>
                        <Select value={editNomineeCatId} onValueChange={setEditNomineeCatId}>
                          <SelectTrigger className="mt-1 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Uncategorized</SelectItem>
                            {categories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Department</Label>
                        <Input className="mt-1 text-xs" value={editNomineeDept} onChange={(e) => setEditNomineeDept(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Level</Label>
                        <Input className="mt-1 text-xs" value={editNomineeLevel} onChange={(e) => setEditNomineeLevel(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Votes Count Override</Label>
                        <Input className="mt-1 text-xs" type="number" min={0} value={editNomineeVotes} onChange={(e) => setEditNomineeVotes(Number(e.target.value))} />
                      </div>
                      <div className="md:col-span-3">
                        <Label className="text-xs">Bio / Citation</Label>
                        <Textarea className="mt-1 text-xs" rows={2} value={editNomineeBio} onChange={(e) => setEditNomineeBio(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button type="submit" size="sm" className="text-xs">Save Changes</Button>
                      <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setEditingNomineeId(null)}>Cancel</Button>
                    </div>
                  </form>
                );
              }

              return (
                <div key={n.id} className="p-3 bg-background flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5 max-w-md">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">{n.name}</span>
                      {n.nominee_code && (
                        <span className="px-2 py-0.5 bg-muted font-mono font-bold text-foreground rounded text-[10px] border border-border/60">
                          Code: #{n.nominee_code}
                        </span>
                      )}
                      {catObj && <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-md text-[10px]">{catObj.title}</span>}
                      {n.level && <span className="text-muted-foreground text-[11px]">{n.level}</span>}
                    </div>
                    {n.department && <p className="text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">{n.department}</p>}
                    {n.bio && <p className="text-muted-foreground text-[11px] line-clamp-1">{n.bio}</p>}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-rose-500">{n.votes_count} votes</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => startEditNominee(n)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleTogglePublishNominee(n.id, n.is_published)}
                    >
                      {n.is_published ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDeleteNominee(n.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function PaymentsAdminPanel() {
  const { data: paystackSettings, isLoading: loadingSettings } = usePaystackSettings();
  const updateSettingsMutation = useUpdatePaystackSettings();
  const { data: payments = [], isLoading: loadingPayments } = usePayments();

  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [merchantEmail, setMerchantEmail] = useState("");
  const [currency, setCurrency] = useState("GHS");
  const [settingsInitialized, setSettingsInitialized] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (paystackSettings && !settingsInitialized) {
      setPublicKey(paystackSettings.publicKey || "");
      setSecretKey(paystackSettings.secretKey || "");
      setMerchantEmail(paystackSettings.merchantEmail || "");
      setCurrency(paystackSettings.currency || "GHS");
      setSettingsInitialized(true);
    }
  }, [paystackSettings, settingsInitialized]);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettingsMutation.mutate(
      {
        publicKey,
        secretKey,
        merchantEmail,
        currency,
      },
      {
        onSuccess: () => {
          toast.success("Paystack Gateway settings saved successfully!");
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Failed to save Paystack settings");
        },
      }
    );
  };

  const isTestMode = publicKey.startsWith("pk_test_");
  const isLiveMode = publicKey.startsWith("pk_live_");

  const filteredPayments = payments.filter((p) => {
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    const matchesSearch =
      p.client_reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.customer_phone.includes(searchQuery) ||
      p.customer_email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const totalCollected = payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const paidCount = payments.filter((p) => p.status === "paid").length;
  const pendingCount = payments.filter((p) => p.status === "pending").length;

  return (
    <div className="space-y-8">
      {/* 1. Paystack Settings Configuration */}
      <section className="bg-card border border-border/60 p-6 rounded-2xl space-y-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-lg font-bold text-foreground">Paystack Payment Gateway Settings</h3>
          </div>
          {isLiveMode ? (
            <span className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full font-semibold">
              Live Mode (Active)
            </span>
          ) : isTestMode ? (
            <span className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full font-semibold">
              Sandbox / Test Mode
            </span>
          ) : (
            <span className="text-xs bg-muted text-muted-foreground border border-border px-2.5 py-1 rounded-full font-semibold">
              Setup Needed
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Configure your Paystack Ghana API keys to accept instant payments via MTN Mobile Money, Telecel Cash, AT Money, and Visa/Mastercard credit or debit cards.
        </p>

        {loadingSettings ? (
          <div className="py-6 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" /> Loading Paystack gateway configuration...
          </div>
        ) : (
          <form onSubmit={handleSaveSettings} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2">
                <Label className="text-xs font-semibold">Paystack Public Key</Label>
                <Input
                  className="mt-1 font-mono text-xs font-medium"
                  placeholder="pk_live_... or pk_test_..."
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  required
                />
                <p className="text-[11px] text-muted-foreground mt-1">Used on client-side checkout popup to initialize payments securely.</p>
              </div>

              <div className="lg:col-span-2">
                <Label className="text-xs font-semibold">Paystack Secret Key (Optional / Backend)</Label>
                <Input
                  type="password"
                  className="mt-1 font-mono text-xs"
                  placeholder="sk_live_... or sk_test_..."
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Used for server-side verification and Supabase Edge Functions.</p>
              </div>

              <div>
                <Label className="text-xs font-semibold">Merchant Contact Email</Label>
                <Input
                  type="email"
                  className="mt-1 text-xs"
                  placeholder="payments@abcossa.org"
                  value={merchantEmail}
                  onChange={(e) => setMerchantEmail(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Official email linked to your Paystack business.</p>
              </div>

              <div>
                <Label className="text-xs font-semibold">Settlement Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="mt-1 text-xs font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GHS">GHS - Ghana Cedi</SelectItem>
                    <SelectItem value="USD">USD - US Dollar</SelectItem>
                    <SelectItem value="NGN">NGN - Nigerian Naira</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">Default payment currency for transactions.</p>
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
              <Button
                type="submit"
                size="sm"
                disabled={updateSettingsMutation.isPending}
                className="text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {updateSettingsMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Paystack Gateway Settings
              </Button>

              <a
                href="https://dashboard.paystack.com/#/settings/developer"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-primary hover:underline flex items-center gap-1"
              >
                Get API Keys from Paystack Dashboard &rarr;
              </a>
            </div>
          </form>
        )}
      </section>

      {/* 2. Financial Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border/60 p-5 rounded-2xl space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Total Payments Collected</span>
          <h4 className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{formatGHS(totalCollected)}</h4>
        </div>

        <div className="bg-card border border-border/60 p-5 rounded-2xl space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Successful Transactions</span>
          <h4 className="text-2xl font-extrabold text-foreground">{paidCount}</h4>
        </div>

        <div className="bg-card border border-border/60 p-5 rounded-2xl space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Pending / Authorization</span>
          <h4 className="text-2xl font-extrabold text-amber-500">{pendingCount}</h4>
        </div>
      </div>

      {/* 3. Transaction History Table */}
      <section className="bg-card border border-border/60 p-6 rounded-2xl space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-foreground">Transaction Logs ({filteredPayments.length})</h3>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-xs w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Search reference, customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 text-xs w-full md:w-56"
            />
          </div>
        </div>

        {loadingPayments ? (
          <div className="py-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" /> Loading transaction records...
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
            No payment transactions found.
          </div>
        ) : (
          <div className="overflow-x-auto border border-border/60 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3">Reference</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Channel</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="p-3 font-mono font-medium text-foreground">{p.client_reference}</td>
                    <td className="p-3">
                      <div className="font-semibold text-foreground">{p.customer_name}</div>
                      <div className="text-[11px] text-muted-foreground">{p.customer_phone} • {p.customer_email}</div>
                    </td>
                    <td className="p-3 font-extrabold text-foreground">{formatGHS(p.amount)}</td>
                    <td className="p-3 uppercase text-[11px] font-medium text-muted-foreground">{p.payment_channel || "momo"}</td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          p.status === "paid"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            : p.status === "pending"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground text-[11px]">
                      {new Date(p.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
