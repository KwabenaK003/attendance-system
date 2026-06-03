import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { assertSupabaseConfigured, SUPABASE_CONFIG_ERROR, supabase } from "../lib/supabase";

type Profile = {
  id: string | null;
  full_name: string;
  role: string;
  department: string;
  company_name: string;
  face_reference: unknown;
  hourly_rate: number;
  created_at?: string;
  email?: string;
};

type SignUpPayload = {
  email: string;
  password: string;
  fullName: string;
  role: string;
  companyName?: string;
  department?: string;
  faceReference?: unknown;
  hourlyRate?: number | string;
};

type AccountUpdates = Partial<{
  full_name: string;
  role: string;
  department: string;
  company_name: string;
  face_reference: unknown;
  hourly_rate: number;
}>;

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ data: unknown; error: unknown }>;
  signUp: (payload: SignUpPayload) => Promise<{ data?: unknown; error: unknown }>;
  signOut: () => Promise<void>;
  fetchProfile: (userId: string, authUser?: User | null) => Promise<Profile | null>;
  updateAccount: (updates: AccountUpdates) => Promise<User | null>;
  userId: string | null;
  displayName: string;
  firstName: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const DEFAULT_SIGNED_IN_ROLE = "admin";

function isMissingProfileColumnError(error: unknown) {
  return /(company_name|face_reference)/i.test((error as { message?: string } | null)?.message || "");
}

function getFallbackFullName(authUser: User | null | undefined) {
  return authUser?.user_metadata?.full_name?.trim() || authUser?.email?.split("@")[0] || "";
}

function buildResolvedProfile(authUser: User | null | undefined, currentProfile: Partial<Profile> | null = null): Profile | null {
  if (!authUser && !currentProfile) return null;

  return {
    ...currentProfile,
    id: currentProfile?.id ?? authUser?.id ?? null,
    full_name: currentProfile?.full_name || getFallbackFullName(authUser),
    role: DEFAULT_SIGNED_IN_ROLE,
    department: currentProfile?.department ?? authUser?.user_metadata?.department ?? "",
    company_name: currentProfile?.company_name ?? authUser?.user_metadata?.company_name ?? "",
    face_reference: currentProfile?.face_reference ?? authUser?.user_metadata?.face_reference ?? null,
    hourly_rate: currentProfile?.hourly_rate ?? authUser?.user_metadata?.hourly_rate ?? 0,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (SUPABASE_CONFIG_ERROR) {
      setLoading(false);
      return;
    }

    async function handleSession(session: Session | null) {
      const nextUser = session?.user ?? null;
      setUser(nextUser);

      if (!nextUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        await fetchProfile(nextUser.id, nextUser);
      } catch (error) {
        console.error("Failed to load profile", error);
        setProfile(buildResolvedProfile(nextUser));
        setLoading(false);
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      void handleSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void handleSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string, authUser: User | null = null) {
    assertSupabaseConfigured();

    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) throw error;

    if (data) {
      const resolvedProfile = buildResolvedProfile(authUser, data as Partial<Profile>);
      setProfile(resolvedProfile);
      setLoading(false);
      return resolvedProfile;
    }

    if (!authUser) {
      setProfile(null);
      setLoading(false);
      return null;
    }

    const profileSeed = {
      id: authUser.id,
      full_name: authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "",
      role: DEFAULT_SIGNED_IN_ROLE,
      department: authUser.user_metadata?.department || "",
      company_name: authUser.user_metadata?.company_name || "",
      face_reference: authUser.user_metadata?.face_reference || null,
      hourly_rate: Number(authUser.user_metadata?.hourly_rate || 0),
    };

    let { data: createdProfile, error: createError } = await supabase
      .from("profiles")
      .insert(profileSeed)
      .select()
      .single();

    if (createError && isMissingProfileColumnError(createError)) {
      ({ data: createdProfile, error: createError } = await supabase
        .from("profiles")
        .insert({
          id: profileSeed.id,
          full_name: profileSeed.full_name,
          role: profileSeed.role,
          department: profileSeed.department,
          hourly_rate: profileSeed.hourly_rate,
        })
        .select()
        .single());
    }

    if (createError) throw createError;

    const resolvedProfile = buildResolvedProfile(authUser, createdProfile as Partial<Profile>);
    setProfile(resolvedProfile);
    setLoading(false);
    return resolvedProfile;
  }

  async function signIn(email: string, password: string) {
    assertSupabaseConfigured();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data?.user) return { data, error };

    try {
      const resolvedProfile = await fetchProfile(data.user.id, data.user);
      if (resolvedProfile?.id) {
        await supabase
          .from("profiles")
          .update({ role: DEFAULT_SIGNED_IN_ROLE })
          .eq("id", resolvedProfile.id);
      }

      const { data: updatedAuth } = await supabase.auth.updateUser({
        data: {
          ...data.user.user_metadata,
          role: DEFAULT_SIGNED_IN_ROLE,
        },
      });
      const updatedUser = updatedAuth?.user || data.user;
      setUser(updatedUser);
      setProfile(buildResolvedProfile(updatedUser, { ...resolvedProfile, role: DEFAULT_SIGNED_IN_ROLE }));
      return { data: { ...data, user: updatedUser }, error: null };
    } catch (profileError) {
      await supabase.auth.signOut();
      return { data, error: profileError };
    }
  }

  async function signUp({
    email,
    password,
    fullName,
    role,
    companyName,
    department,
    faceReference,
    hourlyRate,
  }: SignUpPayload) {
    assertSupabaseConfigured();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          company_name: companyName,
          department,
          face_reference: faceReference || null,
          hourly_rate: Number(hourlyRate || 0),
        },
      },
    });

    if (error) return { error };

    if (data.session?.user) {
      try {
        await fetchProfile(data.session.user.id, data.session.user);
      } catch (profileError) {
        return { data, error: profileError };
      }
    }

    return { data, error };
  }

  async function updateAccount(updates: AccountUpdates) {
    assertSupabaseConfigured();

    if (!user) {
      throw new Error("You must be signed in to update your account.");
    }

    const nextProfile = buildResolvedProfile(user, profile);
    const profileUpsert = {
      id: user.id,
      full_name: typeof updates.full_name === "string" ? updates.full_name : nextProfile?.full_name || getFallbackFullName(user),
      department: typeof updates.department === "string" ? updates.department : nextProfile?.department || "",
      role: typeof updates.role === "string" ? updates.role : nextProfile?.role || DEFAULT_SIGNED_IN_ROLE,
      company_name: typeof updates.company_name === "string" ? updates.company_name : nextProfile?.company_name || "",
      face_reference: updates.face_reference !== undefined ? updates.face_reference : nextProfile?.face_reference || null,
      hourly_rate: typeof updates.hourly_rate === "number" ? updates.hourly_rate : Number(nextProfile?.hourly_rate || 0),
    };

    let { error: profileError } = await supabase
      .from("profiles")
      .upsert(profileUpsert, { onConflict: "id" });

    if (profileError && isMissingProfileColumnError(profileError)) {
      ({ error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: profileUpsert.id,
          full_name: profileUpsert.full_name,
          department: profileUpsert.department,
          role: profileUpsert.role,
          hourly_rate: profileUpsert.hourly_rate,
        }, { onConflict: "id" }));
    }

    if (profileError) throw profileError;

    const metadata = {
      ...user.user_metadata,
      ...(updates.full_name !== undefined ? { full_name: updates.full_name } : {}),
      ...(updates.role !== undefined ? { role: updates.role } : {}),
      ...(updates.department !== undefined ? { department: updates.department } : {}),
      ...(updates.company_name !== undefined ? { company_name: updates.company_name } : {}),
      ...(updates.face_reference !== undefined ? { face_reference: updates.face_reference } : {}),
      ...(updates.hourly_rate !== undefined ? { hourly_rate: updates.hourly_rate } : {}),
    };

    const { data, error } = await supabase.auth.updateUser({ data: metadata });
    if (error) throw error;

    if (data.user) {
      setUser(data.user);
      setProfile((currentProfile) => buildResolvedProfile(data.user, { ...currentProfile, ...profileUpsert, ...updates }));
    }

    return data.user;
  }

  async function signOut() {
    assertSupabaseConfigured();
    await supabase.auth.signOut();
  }

  const resolvedProfile = buildResolvedProfile(user, profile);
  const displayName = resolvedProfile?.full_name || "User";
  const firstName = displayName.split(" ")[0] || "User";

  return (
    <AuthContext.Provider
      value={{
        user,
        profile: resolvedProfile,
        loading,
        signIn,
        signUp,
        signOut,
        fetchProfile,
        updateAccount,
        userId: resolvedProfile?.id ?? user?.id ?? null,
        displayName,
        firstName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
};
