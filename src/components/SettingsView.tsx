import React, { useState } from 'react';
import { Check, KeyRound, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { ActiveRoute, User } from '../types';
import { apiRequest } from '../utils/api';

const PERMISSIONS_MATRIX = [
  { capability: 'View Dashboard, Products & Reports', admin: true, staff: true },
  { capability: 'Create & Edit Products, Categories, Suppliers', admin: true, staff: true },
  { capability: 'Execute Stock-In / Stock-Out & Sales Invoices', admin: true, staff: true },
  { capability: 'Export CSV & PDF Reports', admin: true, staff: true },
  { capability: 'Delete Products, Categories, or Suppliers', admin: true, staff: false },
  { capability: 'Manage Team Accounts & Role Assignments', admin: true, staff: false },
];

export function SettingsView({ onNavigate }: { onNavigate: (route: ActiveRoute) => void }) {
  const { user, setUser } = useAuth();
  const { showToast } = useToast();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2 || !email.includes('@')) {
      showToast('Please provide a valid name and email.', 'error');
      return;
    }
    setSavingProfile(true);
    try {
      const res = await apiRequest<{ user: User }>('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      setUser(res.user);
      showToast('Profile details updated');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast('New password must be at least 6 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match.', 'error');
      return;
    }
    setSavingPassword(true);
    try {
      await apiRequest('/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password updated successfully');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update password', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Account &amp; Workspace Settings</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Update your profile, rotate your password, and review role permissions.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Form */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <UserIcon className="h-4 w-4 text-blue-600" />
            <h3 className="text-base font-semibold text-slate-900">User Profile</h3>
          </div>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label htmlFor="prof-name" className="block text-sm font-medium text-slate-700 mb-1">
                Full Name
              </label>
              <input
                id="prof-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="prof-email" className="block text-sm font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <input
                id="prof-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div className="text-xs text-slate-500">
              Assigned Role: <strong className="capitalize text-slate-900">{user?.role}</strong>
            </div>
            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
            >
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </section>

        {/* Password Form */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <KeyRound className="h-4 w-4 text-blue-600" />
            <h3 className="text-base font-semibold text-slate-900">Change Password</h3>
          </div>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label htmlFor="curr-pw" className="block text-sm font-medium text-slate-700 mb-1">
                Current Password
              </label>
              <input
                id="curr-pw"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="new-pw" className="block text-sm font-medium text-slate-700 mb-1">
                New Password
              </label>
              <input
                id="new-pw"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="conf-pw" className="block text-sm font-medium text-slate-700 mb-1">
                Confirm New Password
              </label>
              <input
                id="conf-pw"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={savingPassword}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
            >
              {savingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </section>
      </div>

      {/* Role Permissions Matrix */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <h3 className="text-base font-semibold text-slate-900">Role Permissions</h3>
          </div>
          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => onNavigate('users')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              Manage Team Users
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <th className="py-3 px-6">Capability</th>
                <th className="py-3 px-6 text-center">Admin</th>
                <th className="py-3 px-6 text-center">Staff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PERMISSIONS_MATRIX.map((row) => (
                <tr key={row.capability}>
                  <td className="py-3 px-6 text-slate-700">{row.capability}</td>
                  <td className="py-3 px-6 text-center">
                    {row.admin ? (
                      <Check className="h-4 w-4 text-emerald-600 mx-auto" />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-3 px-6 text-center">
                    {row.staff ? (
                      <Check className="h-4 w-4 text-emerald-600 mx-auto" />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
