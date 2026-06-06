import { useEffect, useState } from "react";
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
} from "lucide-react";
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

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    toast.message("Signed out");
  };

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
            <Button variant="outline" size="sm" asChild>
              <a href="/" target="_blank" rel="noreferrer">
                View site <ExternalLink className="w-3.5 h-3.5 ml-1" />
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
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
            <TabsTrigger value="settings" className="gap-1.5">
              <Settings className="w-3.5 h-3.5" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="images" className="gap-1.5">
              <Image className="w-3.5 h-3.5" />
              Images
            </TabsTrigger>
            <TabsTrigger value="slides" className="gap-1.5">
              <FolderOpen className="w-3.5 h-3.5" />
              Slides
            </TabsTrigger>
            <TabsTrigger value="research" className="gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              Research
            </TabsTrigger>
            <TabsTrigger value="account" className="gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              Account
            </TabsTrigger>
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
          <TabsContent value="settings">
            <SettingsAdminPanel />
          </TabsContent>
          <TabsContent value="images">
            <SiteImagesAdminPanel />
          </TabsContent>
          <TabsContent value="slides">
            <ResourcesAdminPanel />
          </TabsContent>
          <TabsContent value="research">
            <ResearchAdminPanel userId={user.id} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function InternshipsAdminPanel() {
  const qc = useQueryClient();
  const { data: rows = [], refetch } = useQuery({
    queryKey: ["admin-internships"],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("internships").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
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

  const uploadFile = async (file: File, prefix: string) => {
    if (!supabase) return null;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${prefix}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("internship-images").upload(path, file, { upsert: false });
    if (error) throw error;
    return supabase.storage.from("internship-images").getPublicUrl(path).data.publicUrl;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    let coverImageUrl: string | null = null;
    let logoUrl: string | null = null;
    try {
      if (coverFile) coverImageUrl = await uploadFile(coverFile, "cover");
      if (logoFile) logoUrl = await uploadFile(logoFile, "logo");
    } catch (err) {
      setSaving(false);
      toast.error(err instanceof Error ? err.message : "Upload failed");
      return;
    }
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    const { error } = await supabase.from("internships").insert({
      title: title.trim(),
      organization: organization.trim(),
      location: location.trim() || null,
      timeframe: timeframe.trim() || null,
      deadline: deadline.trim() || null,
      description: description.trim(),
      apply_url: applyUrl.trim() || null,
      tags: tagList,
      is_published: published,
      cover_image_url: coverImageUrl,
      logo_url: logoUrl,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Internship added");
    setTitle(""); setOrganization(""); setLocation(""); setTimeframe("");
    setDeadline(""); setDescription(""); setApplyUrl(""); setTags("");
    setCoverFile(null); setLogoFile(null);
    invalidateAll(qc);
    refetch();
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this internship listing?") || !supabase) return;
    const { error } = await supabase.from("internships").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Removed");
      invalidateAll(qc);
      refetch();
    }
  };

  const togglePub = async (id: string, next: boolean) => {
    if (!supabase) return;
    const { error } = await supabase.from("internships").update({ is_published: next }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      invalidateAll(qc);
      refetch();
    }
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
          {(rows as { id: string; title: string; is_published: boolean }[]).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 card-nature p-3 rounded-xl text-sm">
              <span className="flex-1 font-medium">{r.title}</span>
              <div className="flex items-center gap-2">
                <Switch checked={r.is_published} onCheckedChange={(c) => togglePub(r.id, c)} />
                <span className="text-muted-foreground text-xs">Visible</span>
              </div>
              <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(r.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function EventsAdminPanel() {
  const qc = useQueryClient();
  const { data: rows = [], refetch } = useQuery({
    queryKey: ["admin-events"],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("events").select("*").order("starts_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    let coverImageUrl: string | null = null;
    if (coverFile) {
      const ext = coverFile.name.split(".").pop() || "jpg";
      const path = `cover-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("event-images").upload(path, coverFile, { upsert: false });
      if (upErr) { setSaving(false); toast.error(upErr.message); return; }
      coverImageUrl = supabase.storage.from("event-images").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase.from("events").insert({
      title: title.trim(),
      event_type: eventType,
      location: loc.trim() || null,
      starts_at: new Date(starts).toISOString(),
      ends_at: ends.trim() ? new Date(ends).toISOString() : null,
      description: desc.trim() || null,
      register_url: regUrl.trim() || null,
      featured,
      is_published: published,
      cover_image_url: coverImageUrl,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Event added");
    setTitle(""); setLoc(""); setStarts(""); setEnds("");
    setDesc(""); setRegUrl(""); setFeatured(false); setCoverFile(null);
    invalidateAll(qc);
    refetch();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this event?") || !supabase) return;
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      invalidateAll(qc);
      refetch();
    }
  };

  const togglePub = async (id: string, next: boolean) => {
    if (!supabase) return;
    await supabase.from("events").update({ is_published: next }).eq("id", id);
    invalidateAll(qc);
    refetch();
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
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Workshop", "Seminar", "Conference", "Outreach", "Social", "Other"].map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
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
        {(rows as { id: string; title: string; starts_at: string; is_published: boolean }[]).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 card-nature p-3 rounded-xl text-sm">
            <span className="flex-1">
              <span className="font-medium">{r.title}</span>
              <span className="text-muted-foreground ml-2 text-xs">{new Date(r.starts_at).toLocaleString()}</span>
            </span>
            <Switch checked={r.is_published} onCheckedChange={(c) => togglePub(r.id, c)} />
            <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(r.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnnouncementsAdminPanel() {
  const qc = useQueryClient();
  const { data: rows = [], refetch } = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [published, setPublished] = useState(true);
  const [saving, setSaving] = useState(false);

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
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Announcement posted");
    setTitle("");
    setBody("");
    setLinkUrl("");
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
        {(rows as { id: string; title: string; is_published: boolean }[]).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 card-nature p-3 rounded-xl text-sm">
            <span className="flex-1 font-medium">{r.title}</span>
            <Switch checked={r.is_published} onCheckedChange={(c) => togglePub(r.id, c)} />
            <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(r.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlogAdminPanel({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: rows = [], refetch } = useQuery({
    queryKey: ["admin-blog"],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("blog_posts").select("*").order("published_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
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
        {(rows as { id: string; title: string; slug: string; is_published: boolean }[]).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 card-nature p-3 rounded-xl text-sm">
            <span className="flex-1 font-medium">{r.title}</span>
            <Link
              to={`/news/${r.slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary text-xs underline"
            >
              View
            </Link>
            <Switch checked={r.is_published} onCheckedChange={(c) => togglePub(r.id, c)} />
            <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(r.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </li>
        ))}
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
      const { data, error } = await supabase.from("leadership_members").select("*").order("display_order", { ascending: true });
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
  const additionalMembers = rows.filter((r) => !coreRoles.has(r.role));

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
            Update each position directly. Changes appear immediately on the About page.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {LEADERSHIP_ROLES.map((slot) => (
            <LeadershipSlotCard
              key={slot.role}
              slot={slot}
              existing={rows.find((r) => r.role === slot.role)}
              userId={userId}
              onSaved={onSaved}
            />
          ))}
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
          <div className="grid sm:grid-cols-2 gap-4">
            {additionalMembers.map((member) => (
              <AdditionalLeaderCard
                key={member.id}
                member={member}
                userId={userId}
                onSaved={onSaved}
                onDeleted={onSaved}
              />
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

function ResourcesAdminPanel() {
  const qc = useQueryClient();

  const { data: rows = [], refetch } = useQuery({
    queryKey: ["admin-resources"],
    queryFn: async (): Promise<ResourceRow[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("resources")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ResourceRow[];
    },
  });

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
    toast.success("Folder added");
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
    if (!confirm("Remove this folder link?") || !supabase) return;
    const { error } = await supabase.from("resources").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed");
    invalidate();
  };

  return (
    <div className="space-y-8">
      <section className="card-nature p-6 rounded-2xl space-y-4">
        <h2 className="font-display text-lg font-semibold">Add a Google Drive folder</h2>
        <p className="text-sm text-muted-foreground">
          Each entry appears as a card on the public Resources page, filtered by year and semester.
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
            <Input className="mt-1" value={label} onChange={(e) => setLabel(e.target.value)} required placeholder="e.g. L100 2nd Semester Slides" />
          </div>
          <div className="sm:col-span-2">
            <Label>Google Drive URL</Label>
            <Input className="mt-1" type="url" value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} required placeholder="https://drive.google.com/drive/folders/..." />
          </div>
          <Button type="submit" disabled={adding} className="sm:col-span-2 w-full sm:w-auto">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add folder"}
          </Button>
        </form>
      </section>

      <section>
        <h3 className="font-medium mb-3">Current folders ({rows.length})</h3>
        <ul className="space-y-2">
          {rows.map((row) =>
            editingId === row.id ? (
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
              <li key={row.id} className="flex flex-wrap items-center gap-3 card-nature p-3 rounded-xl text-sm">
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
            )
          )}
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
          {publishedWorks.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-3 card-nature p-3 rounded-xl text-sm">
              <span className="flex-1">
                <span className="font-medium">{w.title}</span>
                <span className="text-muted-foreground ml-2 text-xs">
                  {w.category}{w.year ? `, ${w.year}` : ""} — {w.author_name}
                </span>
              </span>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => approveWork(w.id, false)}>
                Unpublish
              </Button>
              <Button type="button" variant="ghost" size="icon" className="text-destructive h-7 w-7" onClick={() => removeWork(w.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
