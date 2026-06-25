import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  MoreVertical,
  Save,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { createDetachedSupabaseClient, SUPABASE_CONFIG_ERROR, supabase } from "../lib/supabase";

type UserEditorForm = {
  fullName: string;
  email: string;
  password: string;
};

type AdminUserUpdateResponse = {
  user?: {
    id: string;
    email?: string | null;
    user_metadata?: {
      full_name?: string | null;
    } | null;
  };
  profile?: {
    id: string;
    full_name?: string | null;
    role?: string | null;
  };
};

type UserEditorModalProps = {
  user: LooseRow | null;
  saving: boolean;
  onClose: () => void;
  onSave: (user: LooseRow | null, form: UserEditorForm) => Promise<{ error?: unknown }>;
};

const LOCAL_USERS_KEY = "attendance-system:created-admin-users";

function readLocalUsers(): LooseRow[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_USERS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalUsers(users: LooseRow[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {
    // Ignore local persistence failures; Supabase remains the source when available.
  }
}

function upsertLocalUser(user: LooseRow) {
  const users = readLocalUsers();
  const existingIndex = users.findIndex((entry) => entry.id === user.id || entry.email === user.email);
  const nextUser = {
    ...users[existingIndex],
    ...user,
    updated_at: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    users[existingIndex] = nextUser;
  } else {
    users.unshift(nextUser);
  }

  writeLocalUsers(users);
  return users;
}

function removeLocalUser(userId: string) {
  const users = readLocalUsers().filter((entry) => entry.id !== userId);
  writeLocalUsers(users);
  return users;
}

function UserEditorModal({ user, saving, onClose, onSave }: UserEditorModalProps) {
  const isCreateMode = !user?.id;
  const [form, setForm] = useState<UserEditorForm>({
    fullName: user?.full_name || "",
    email: user?.email || "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm({
      fullName: user?.full_name || "",
      email: user?.email || "",
      password: "",
    });
    setError("");
  }, [user]);

  const set = (field: keyof UserEditorForm) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.fullName.trim() || !form.email.trim() || (isCreateMode && !form.password)) {
      setError(isCreateMode ? "Name, email, and password are required." : "Name and email are required.");
      return;
    }

    setError("");
    const result = await onSave(user, form);
    if (result?.error) {
      setError(result.error instanceof Error ? result.error.message : String(result.error || "Unable to save user."));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={handleSubmit} className="card relative z-10 w-full max-w-2xl p-6 animate-fade-up">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink">{isCreateMode ? "Create User" : "Edit User"}</h3>
            <p className="mt-1 text-sm text-ink-muted">
              {isCreateMode
                ? "Create an admin sign-in account."
                : "Update the admin user details tracked by this app. Password changes must be made in Supabase Auth."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-muted transition-colors hover:text-ink" aria-label="Close user editor">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Name *</label>
            <input className="input" value={form.fullName} onChange={set("fullName")} placeholder="Jane Doe" required />
          </div>
          <div>
            <label className="label">Email *</label>
            <input className="input" type="email" value={form.email} onChange={set("email")} placeholder="jane@company.com" required />
          </div>
          {isCreateMode ? (
            <div>
              <label className="label">Password *</label>
              <div className="relative">
                <input
                  className="input pr-12"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={set("password")}
                  placeholder="Create a password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-warn/20 bg-warn/10 px-4 py-3 text-sm text-warn">
              Login passwords live in Supabase Auth and cannot be changed from this browser-only admin list.
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : isCreateMode ? "Create User" : "Save User"}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<LooseRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<LooseRow | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LooseRow | null>(null);

  useEffect(() => {
    void fetchUsers();
  }, []);

  useEffect(() => {
    if (!activeMenuId) return undefined;

    function handlePointerDown(event: MouseEvent) {
      if (!(event.target as HTMLElement).closest("[data-user-actions]")) {
        setActiveMenuId(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [activeMenuId]);

  async function fetchUsers() {
    setLoading(true);

    try {
      const local = readLocalUsers();

      if (SUPABASE_CONFIG_ERROR) {
        setUsers(local);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("id, full_name, role, created_at")
        .eq("role", "admin")
        .order("created_at", { ascending: false });

      if (fetchError) {
        setUsers(local);
        setError(fetchError.message || "Unable to load created users.");
        return;
      }

      const localById = new Map(local.map((entry) => [entry.id, entry]));
      const remoteUsers = (data || []).map((entry) => ({
        ...entry,
        email: localById.get(entry.id)?.email || "",
      }));
      const remoteIds = new Set(remoteUsers.map((entry) => entry.id));
      setUsers([
        ...remoteUsers,
        ...local.filter((entry) => !remoteIds.has(entry.id)),
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser(_user: LooseRow | null, nextForm: UserEditorForm) {
    setError("");
    setSuccess("");

    if (!nextForm.fullName.trim() || !nextForm.email.trim() || !nextForm.password) {
      return { error: new Error("Name, email, and password are required.") };
    }

    setSaving(true);

    try {
      if (SUPABASE_CONFIG_ERROR) {
        throw new Error(SUPABASE_CONFIG_ERROR);
      }

      const detachedSupabase = createDetachedSupabaseClient();
      const { data, error: signUpError } = await detachedSupabase.auth.signUp({
        email: nextForm.email.trim(),
        password: nextForm.password,
        options: {
          data: {
            full_name: nextForm.fullName.trim(),
            role: "admin",
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      const createdUser = data?.user || data?.session?.user;
      if (!createdUser?.id) {
        throw new Error("User was created, but Supabase did not return a user id.");
      }

      let profileWarning = "";
      const profilePayload = {
        id: createdUser.id,
        full_name: nextForm.fullName.trim(),
        role: "admin",
        department: "",
        hourly_rate: 0,
      };

      const profileClient = data?.session ? detachedSupabase : supabase;
      const { error: profileError } = await profileClient
        .from("profiles")
        .upsert(profilePayload, { onConflict: "id" });

      if (profileError) {
        profileWarning = " They can still sign in after email confirmation; their admin profile will be created on first login.";
      }

      const nextLocalUsers = upsertLocalUser({
        id: createdUser.id,
        full_name: nextForm.fullName.trim(),
        email: nextForm.email.trim(),
        role: "admin",
        created_at: createdUser.created_at || new Date().toISOString(),
      });

      setUsers((current) => {
        const existingIds = new Set(current.map((entry) => entry.id));
        const createdLocalUser = nextLocalUsers.find((local) => local.id === createdUser.id);
        if (!createdLocalUser) {
          return current;
        }

        return existingIds.has(createdUser.id)
          ? current.map((entry) => entry.id === createdUser.id ? { ...entry, ...createdLocalUser } : entry)
          : [createdLocalUser, ...current];
      });
      setSuccess(`User created as an admin.${profileWarning}`);
      setCreatingUser(false);
      return {};
    } catch (createError) {
      setError((createError as Error).message || "Unable to create user.");
      return { error: createError };
    } finally {
      setSaving(false);
    }
  }

  async function handleEditUser(user: LooseRow | null, nextForm: UserEditorForm) {
    if (!user?.id) {
      return { error: new Error("Selected user is missing.") };
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const fullName = nextForm.fullName.trim();
      const email = nextForm.email.trim();
      const password = nextForm.password.trim();
      const localUser = {
        id: user.id,
        full_name: fullName,
        email,
        role: "admin",
        created_at: user.created_at || new Date().toISOString(),
      };

      if (!SUPABASE_CONFIG_ERROR) {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ full_name: localUser.full_name, role: "admin" })
          .eq("id", user.id);

        if (updateError) {
          if (updateError.message?.includes("function") || updateError.message?.includes("does not exist")) {
            throw new Error("Unable to update user. Please execute supabase/admin_user_helpers.sql in the Supabase SQL editor first.");
          }
          throw updateError;
        }

        if (data?.user?.id && data.user.id !== user.id) {
          throw new Error("The Supabase auth update returned an unexpected user.");
        }

        localUser.full_name = data?.profile?.full_name || data?.user?.user_metadata?.full_name || fullName;
        localUser.email = data?.user?.email ?? email;
      }

      upsertLocalUser(localUser);
      setUsers((current) => current.map((entry) => entry.id === user.id ? { ...entry, ...localUser } : entry));
      setEditingUser(null);
      setSuccess("User details saved. Change login email/password in Supabase Auth or through a backend admin endpoint.");
      return {};
    } catch (editError) {
      return { error: editError };
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteUser(user: LooseRow) {
    setError("");
    setSuccess("");

    try {
      if (!SUPABASE_CONFIG_ERROR) {
        const { error: deleteError } = await supabase.rpc("delete_user_by_admin", {
          target_user_id: user.id
        });
        if (deleteError) {
          if (deleteError.message?.includes("function") || deleteError.message?.includes("does not exist")) {
            throw new Error("Unable to delete user. Please execute supabase/admin_user_helpers.sql in the Supabase SQL editor first.");
          }
          throw deleteError;
        }
      }

      if (user.id) {
        removeLocalUser(user.id);
      }
      setUsers((current) => current.filter((entry) => entry.id !== user.id));
      setDeleteTarget(null);
      setActiveMenuId(null);
      setSuccess("User deleted successfully.");
    } catch (deleteError) {
      setError((deleteError as Error).message || "Unable to delete user.");
    }
  }

  return (
      <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 animate-fade-up">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Users
          </div>
          <h2 className="mt-3 font-display text-2xl font-bold text-ink">Users</h2>
          <p className="mt-1 text-sm text-ink-muted">Create and track admin sign-in accounts for the attendance system.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreatingUser(true)}
          className="btn-primary text-sm"
        >
          <UserPlus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-auto text-danger transition-colors hover:text-ink" aria-label="Dismiss error">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-accent">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          <span>{success}</span>
          <button onClick={() => setSuccess("")} className="ml-auto text-accent transition-colors hover:text-ink" aria-label="Dismiss success">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="card animate-fade-up overflow-visible">
        <div className="border-b border-border px-5 py-4">
          <h3 className="font-display text-lg font-semibold text-ink">Created Admin Users</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-ink-muted">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="mx-auto mb-2 h-8 w-8 text-ink-muted" />
            <p className="text-ink-muted">No users created yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {users.map((user) => (
              <div key={user.id} className="flex items-center gap-4 px-5 py-4 hover:bg-page-bg">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-accent/15 bg-accent/10 font-display text-sm font-bold text-accent">
                  {(user.full_name || user.email || "?").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{user.full_name || "Unnamed Admin"}</p>
                  <p className="truncate text-xs text-ink-muted">{user.email || "Email only visible for users created from this browser"}</p>
                </div>
                <span className="badge badge-blue text-xs">Admin</span>
                <div data-user-actions className="relative">
                  <button
                    type="button"
                    onClick={() => setActiveMenuId((currentId) => currentId === (user.id ?? "") ? null : (user.id ?? ""))}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-page-bg text-ink-muted transition-colors hover:bg-page-bg hover:text-ink"
                    aria-label={`Open actions for ${user.full_name || user.email || "user"}`}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {activeMenuId === user.id && (
                    <div className="absolute bottom-full right-0 z-10 mb-2 w-36 rounded-xl border border-border bg-card-bg p-1.5 shadow-lg shadow-black/10">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUser(user);
                          setActiveMenuId(null);
                        }}
                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-page-bg"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteTarget(user);
                          setActiveMenuId(null);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {creatingUser && (
        <UserEditorModal
          user={null}
          saving={saving}
          onClose={() => setCreatingUser(false)}
          onSave={handleCreateUser}
        />
      )}

      {editingUser && (
        <UserEditorModal
          user={editingUser}
          saving={saving}
          onClose={() => setEditingUser(null)}
          onSave={handleEditUser}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="card relative z-10 w-full max-w-sm p-6 text-center animate-fade-up">
            <Trash2 className="mx-auto mb-3 h-10 w-10 text-danger" />
            <h3 className="mb-1 font-display text-lg font-semibold text-ink">Delete User?</h3>
            <p className="mb-5 text-sm text-ink-muted">
              This removes {deleteTarget.full_name || deleteTarget.email || "this user"} from the app list.
            </p>
            <div className="flex gap-3">
              <button onClick={() => handleDeleteUser(deleteTarget)} className="btn-danger flex-1 justify-center">
                Delete
              </button>
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1 justify-center">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
