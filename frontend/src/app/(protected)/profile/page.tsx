'use client';

import { useState, useEffect } from 'react';
import { useAuth, useUpdateProfile, useChangePassword } from '@/hooks/useAuth';
import { useTeams } from '@/hooks/useTeams';
import {
  User, Mail, AtSign, Calendar, Shield, KeyRound,
  CheckCircle2, AlertCircle, Loader2, Edit3, Lock,
  Users, Award, Clock,
} from 'lucide-react';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const profileSchema = z.object({
  name:     z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters')
    .max(30)
    .regex(/^[a-z0-9_]+$/, 'Letters, numbers, and underscores only'),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Must be at least 8 characters').max(72),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// ---------------------------------------------------------------------------
// Avatar initials helper
// ---------------------------------------------------------------------------

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ---------------------------------------------------------------------------
// Alert banner
// ---------------------------------------------------------------------------

function Alert({ type, message }: { type: 'success' | 'error'; message: string }) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-xs sm:text-sm font-medium border ${
        type === 'success'
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-red-50 border-red-200 text-red-600'
      }`}
    >
      {type === 'success' ? (
        <CheckCircle2 size={16} className="flex-shrink-0" />
      ) : (
        <AlertCircle size={16} className="flex-shrink-0" />
      )}
      <span>{message}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProfileForm section
// ---------------------------------------------------------------------------

function ProfileForm() {
  const { data: user } = useAuth();
  const updateProfile   = useUpdateProfile();
  const [form, setForm] = useState({ name: '', username: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    if (user) setForm({ name: user.name, username: user.username });
  }, [user]);

  const isDirty = user && (form.name !== user.name || form.username !== user.username);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setBanner(null);

    const parsed = profileSchema.safeParse(form);
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors;
      const fieldErrors: Record<string, string> = {};
      Object.entries(fe).forEach(([k, v]) => { if (v?.[0]) fieldErrors[k] = v[0]; });
      setErrors(fieldErrors);
      return;
    }

    try {
      await updateProfile.mutateAsync(parsed.data);
      setBanner({ type: 'success', msg: 'Profile updated successfully.' });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to update profile.';
      setBanner({ type: 'error', msg });
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-emerald-50 flex-shrink-0">
          <Edit3 size={17} className="text-emerald-600" />
        </div>
        <div>
          <h2 className="text-sm sm:text-base font-bold text-gray-900">Profile Information</h2>
          <p className="text-xs text-gray-400 mt-0.5">Update your display name and username</p>
        </div>
      </div>

      {banner && <div className="mb-4"><Alert type={banner.type} message={banner.msg} /></div>}

      <form onSubmit={handleSubmit} className="space-y-4" id="profile-form">
        <div>
          <label htmlFor="profile-name" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
            Display Name
          </label>
          <div className="relative">
            <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="profile-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 text-gray-900 text-sm outline-none transition"
              placeholder="Your full name"
            />
          </div>
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="profile-username" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
            Username
          </label>
          <div className="relative">
            <AtSign size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="profile-username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 text-gray-900 text-sm outline-none transition"
              placeholder="your_username"
            />
          </div>
          {errors.username && <p className="mt-1 text-xs text-red-500">{errors.username}</p>}
        </div>

        <div>
          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
          <div className="relative">
            <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={user?.email ?? ''}
              disabled
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-100 text-gray-400 text-sm cursor-not-allowed"
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">Email cannot be changed.</p>
        </div>

        <div className="pt-2">
          <button
            id="save-profile-btn"
            type="submit"
            disabled={!isDirty || updateProfile.isPending}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition shadow-sm"
          >
            {updateProfile.isPending && <Loader2 size={14} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// PasswordForm section
// ---------------------------------------------------------------------------

function PasswordForm() {
  const changePassword = useChangePassword();
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [banner, setBanner]   = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setBanner(null);

    const parsed = passwordSchema.safeParse(form);
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors;
      const fieldErrors: Record<string, string> = {};
      Object.entries(fe).forEach(([k, v]) => { if (v?.[0]) fieldErrors[k] = v[0]; });
      setErrors(fieldErrors);
      return;
    }

    try {
      await changePassword.mutateAsync({
        currentPassword: parsed.data.currentPassword,
        newPassword:     parsed.data.newPassword,
      });
      setBanner({ type: 'success', msg: 'Password changed successfully.' });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to change password.';
      setBanner({ type: 'error', msg });
    }
  };

  const inputClass =
    'w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 text-gray-900 text-sm outline-none transition';

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-amber-50 flex-shrink-0">
          <Lock size={17} className="text-amber-600" />
        </div>
        <div>
          <h2 className="text-sm sm:text-base font-bold text-gray-900">Change Password</h2>
          <p className="text-xs text-gray-400 mt-0.5">Keep your account secure</p>
        </div>
      </div>

      {banner && <div className="mb-4"><Alert type={banner.type} message={banner.msg} /></div>}

      <form onSubmit={handleSubmit} className="space-y-4" id="password-form">
        {(['currentPassword', 'newPassword', 'confirmPassword'] as const).map((field) => {
          const labels = {
            currentPassword: 'Current Password',
            newPassword:     'New Password',
            confirmPassword: 'Confirm New Password',
          };
          return (
            <div key={field}>
              <label htmlFor={`pwd-${field}`} className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                {labels[field]}
              </label>
              <div className="relative">
                <KeyRound size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id={`pwd-${field}`}
                  type={showPass ? 'text' : 'password'}
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </div>
              {errors[field] && <p className="mt-1 text-xs text-red-500">{errors[field]}</p>}
            </div>
          );
        })}

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="show-passwords"
            checked={showPass}
            onChange={(e) => setShowPass(e.target.checked)}
            className="accent-emerald-600 rounded"
          />
          <label htmlFor="show-passwords" className="text-xs text-gray-500 cursor-pointer select-none">
            Show passwords
          </label>
        </div>

        <div className="pt-2">
          <button
            id="change-password-btn"
            type="submit"
            disabled={changePassword.isPending}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition shadow-sm"
          >
            {changePassword.isPending && <Loader2 size={14} className="animate-spin" />}
            Change Password
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ProfilePage
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const { data: user, isLoading } = useAuth();
  const { data: teams }           = useTeams();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-emerald-500" size={28} />
      </div>
    );
  }

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        month: 'long',
        year:  'numeric',
      })
    : '—';

  const stats = [
    { label: 'Teams',        value: teams?.length ?? 0,                                icon: Users,    color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Owned',        value: teams?.filter((t) => t.role === 'OWNER').length ?? 0, icon: Award, color: 'text-amber-600 bg-amber-50' },
    { label: 'Member since', value: memberSince,                                        icon: Clock,    color: 'text-sky-600 bg-sky-50' },
  ];

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 md:p-8">
      {/* ── Page header ── */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Profile</h1>
        <p className="mt-1 text-gray-500 text-xs sm:text-sm">Manage your personal information and security.</p>
      </div>

      {/* ── Hero card ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-sm mb-5 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
            {/* Avatar */}
            <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-400 flex items-center justify-center flex-shrink-0 shadow-md">
              <span className="text-white text-lg sm:text-xl font-bold tracking-wide">
                {user ? getInitials(user.name) : '?'}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-gray-900 truncate">{user?.name}</h2>
                <div className="sm:hidden flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0">
                  <Shield size={10} />
                  Verified
                </div>
              </div>
              <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
                <AtSign size={12} /> {user?.username}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-1.5 pt-1 sm:pt-0 border-t sm:border-t-0 border-gray-100">
            <span className="flex items-center gap-1.5 text-xs text-gray-500 truncate">
              <Mail size={13} className="text-gray-400 flex-shrink-0" />
              {user?.email}
            </span>
            <div className="hidden sm:flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full flex-shrink-0">
              <Shield size={12} />
              Verified
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-5 pt-4 sm:pt-5 border-t border-gray-100 grid grid-cols-3 gap-2 sm:gap-4">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2 rounded-xl bg-gray-50/60 sm:bg-transparent">
              <div className={`p-2 rounded-lg ${color.split(' ')[1]} self-start sm:self-center`}>
                <Icon size={15} className={color.split(' ')[0]} />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-gray-900 truncate">{value}</p>
                <p className="text-[10px] sm:text-xs text-gray-400 truncate">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Member since info ── */}
      <div className="bg-white border border-gray-200 rounded-2xl px-4 sm:px-5 py-3.5 sm:py-4 shadow-sm mb-5 sm:mb-6 flex items-center gap-3">
        <Calendar size={15} className="text-gray-400 flex-shrink-0" />
        <span className="text-xs sm:text-sm text-gray-500">
          Account created in <span className="font-semibold text-gray-700">{memberSince}</span>
        </span>
      </div>

      {/* ── Edit forms ── */}
      <div className="space-y-4 sm:space-y-5">
        <ProfileForm />
        <PasswordForm />
      </div>
    </div>
  );
}
