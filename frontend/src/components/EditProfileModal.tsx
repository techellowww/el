'use client';

import React, { useState, useRef } from 'react';
import { useAuthStore, UserSession } from '@/lib/store';
import { getInitials } from '@/lib/utils';
import {
  X,
  Upload,
  Camera,
  Trash2,
  User,
  Briefcase,
  Phone,
  Clock,
  Mail,
  Lock,
  Check,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Building,
  Sparkles,
} from 'lucide-react';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COMMON_TIMEZONES = [
  { value: 'Asia/Kolkata', label: '(UTC+05:30) Chennai, Kolkata, Mumbai, New Delhi' },
  { value: 'America/New_York', label: '(UTC-05:00) Eastern Time (US & Canada)' },
  { value: 'America/Chicago', label: '(UTC-06:00) Central Time (US & Canada)' },
  { value: 'America/Denver', label: '(UTC-07:00) Mountain Time (US & Canada)' },
  { value: 'America/Los_Angeles', label: '(UTC-08:00) Pacific Time (US & Canada)' },
  { value: 'Europe/London', label: '(UTC+00:00) London, Edinburgh, Dublin' },
  { value: 'Europe/Paris', label: '(UTC+01:00) Paris, Amsterdam, Berlin, Rome' },
  { value: 'Asia/Dubai', label: '(UTC+04:00) Dubai, Abu Dhabi, Muscat' },
  { value: 'Asia/Singapore', label: '(UTC+08:00) Singapore, Kuala Lumpur, Hong Kong' },
  { value: 'Asia/Tokyo', label: '(UTC+09:00) Tokyo, Osaka, Sapporo' },
  { value: 'Australia/Sydney', label: '(UTC+11:00) Sydney, Melbourne' },
  { value: 'UTC', label: '(UTC+00:00) Coordinated Universal Time' },
];

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&q=80',
];

export function EditProfileModal({ isOpen, onClose }: EditProfileModalProps) {
  const { user, updateUser } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile state
  const [name, setName] = useState(user?.name || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [title, setTitle] = useState(user?.title || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [timezone, setTimezone] = useState(user?.timezone || 'Asia/Kolkata');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null);

  // Password state
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI feedback state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Sync state when modal opens
  React.useEffect(() => {
    if (isOpen && user) {
      setName(user.name || '');
      setDisplayName(user.displayName || '');
      setTitle(user.title || '');
      setPhone(user.phone || '');
      setDepartment(user.department || '');
      setTimezone(user.timezone || 'Asia/Kolkata');
      setBio(user.bio || '');
      setAvatarUrl(user.avatarUrl || null);
      setError(null);
      setSuccess(null);
      setShowPasswordSection(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  // Handle local image file upload with client-side compression
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image file size must be less than 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Resize and crop to square 256x256
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const size = Math.min(img.width, img.height);
        const startX = (img.width - size) / 2;
        const startY = (img.height - size) / 2;

        ctx.drawImage(img, startX, startY, size, size, 0, 0, 256, 256);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        setAvatarUrl(dataUrl);
        setError(null);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim()) {
      setError('Full name is required.');
      return;
    }

    if (newPassword) {
      if (!currentPassword) {
        setError('Please enter your current password to set a new password.');
        return;
      }
      if (newPassword.length < 6) {
        setError('New password must be at least 6 characters long.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('New passwords do not match.');
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          displayName: displayName.trim() || null,
          title: title.trim() || null,
          phone: phone.trim() || null,
          department: department.trim() || null,
          timezone,
          bio: bio.trim() || null,
          avatarUrl: avatarUrl || null,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      // Update local client store immediately
      updateUser(data.user);
      setSuccess('Profile updated successfully!');

      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Something went wrong while updating profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-border w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header (Slack Style) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-text-primary tracking-tight">
              Edit your profile
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Customize how your teammates see you across ClientHub.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-text-primary hover:bg-slate-200/60 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5 text-xs text-error">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 text-xs text-emerald-700">
              <Check className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Top section: Profile photo (Slack Style) */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="relative group shrink-0">
              <div className="w-20 h-20 rounded-2xl overflow-hidden bg-primary text-white flex items-center justify-center font-bold text-2xl shadow-sm border border-white">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName || name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{getInitials(displayName || name)}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/40 text-white rounded-2xl flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition duration-150 cursor-pointer"
              >
                <Camera className="w-5 h-5 mb-0.5" />
                <span className="text-[10px] font-medium">Change</span>
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold text-text-primary">Profile Photo</h3>
              <p className="text-[11px] text-text-secondary mt-0.5 mb-2.5">
                Upload a friendly face photo so teammates easily identify your deliverables & updates.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageFileChange}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white text-xs font-medium text-text-primary hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  <span>Upload an image</span>
                </button>

                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl(null)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white text-xs font-medium text-red-600 hover:bg-red-50 transition cursor-pointer shadow-2xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove photo</span>
                  </button>
                )}
              </div>

              {/* Preset avatars */}
              <div className="flex items-center gap-1.5 mt-3">
                <span className="text-[10px] text-slate-400">Presets:</span>
                {PRESET_AVATARS.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAvatarUrl(url)}
                    className={`w-6 h-6 rounded-full overflow-hidden border transition ${
                      avatarUrl === url ? 'ring-2 ring-primary border-white' : 'border-slate-300 hover:opacity-80'
                    }`}
                  >
                    <img src={url} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Form Fields (Slack Edit Profile format) */}
          <div className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                Full name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sarah Jenkins"
                className="w-full px-3 py-2 bg-white border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
              />
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                Display name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Sarah"
                className="w-full px-3 py-2 bg-white border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
              />
              <p className="text-[11px] text-text-secondary mt-1">
                This could be your first name, or a nickname — however you’d like people to refer to you in ClientHub.
              </p>
            </div>

            {/* What I do (Title) & Department */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  What I do (Title)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Senior Frontend Engineer"
                  className="w-full px-3 py-2 bg-white border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
                />
                <p className="text-[11px] text-text-secondary mt-1">
                  Let people know what you do at the company.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Department
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Engineering, Design, Operations"
                  className="w-full px-3 py-2 bg-white border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
                />
              </div>
            </div>

            {/* Phone & Timezone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Phone number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +1 (555) 019-2834"
                  className="w-full px-3 py-2 bg-white border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs cursor-pointer"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-text-secondary mt-1">
                  Your current timezone for activity logs & delivery schedules.
                </p>
              </div>
            </div>

            {/* About me (Status / Bio) */}
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                About me / Status
              </label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="e.g. Focusing on client delivery pipelines • Available Mon-Fri 9:30 AM - 6:30 PM"
                className="w-full px-3 py-2 bg-white border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs resize-none"
              />
            </div>

            {/* Email (Account locked badge) */}
            <div className="p-3 rounded-xl bg-slate-50 border border-border flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <Mail className="w-4 h-4 text-slate-400" />
                <span className="font-semibold text-text-primary">{user.email}</span>
                <span className="text-[10px] font-mono uppercase bg-slate-200/80 text-slate-600 px-1.5 py-0.5 rounded">
                  {user.role}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Managed by workspace
              </span>
            </div>

            {/* Password Change Toggle */}
            <div className="pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShowPasswordSection(!showPasswordSection)}
                className="flex items-center justify-between w-full text-xs font-medium text-slate-700 hover:text-primary transition py-1 cursor-pointer"
              >
                <span className="flex items-center gap-1.5 font-semibold">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  Change password
                </span>
                {showPasswordSection ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {showPasswordSection && (
                <div className="mt-3 p-3.5 rounded-xl bg-slate-50/70 border border-border space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 bg-white border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary shadow-2xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">
                        New Password (min 6 characters)
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 bg-white border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 bg-white border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary shadow-2xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-border bg-white text-xs font-medium text-text-secondary hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-hover shadow-sm transition cursor-pointer disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

