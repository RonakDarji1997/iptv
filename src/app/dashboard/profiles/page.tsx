'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useProfiles } from '@/hooks/useProfiles';
import { useProviders } from '@/hooks/useProviders';

export default function ProfilesPage() {
  const userId = 'user-1';
  const { providers } = useProviders(userId);
  const { profiles, loading, error, addProfile, updateProfile, deleteProfile } = useProfiles(userId);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    providerId: '',
    name: '',
    type: 'ADMIN',
    pin: '',
    ageRating: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data: Record<string, unknown> = {
      providerId: formData.providerId,
      name: formData.name,
      type: formData.type,
    };
    if (formData.pin) data.pin = formData.pin;
    if (formData.ageRating) data.ageRating = parseInt(formData.ageRating);
    
    const result = await addProfile(data);
    if (result.success) {
      setShowAddModal(false);
      setFormData({ providerId: '', name: '', type: 'ADMIN', pin: '', ageRating: '' });
    } else {
      alert(`Error: ${result.error}`);
    }
  };

  const handleDelete = async (profileId: string, profileName: string) => {
    if (!confirm(`Delete profile "${profileName}"?`)) return;
    const result = await deleteProfile(profileId);
    if (!result.success) {
      alert(`Delete failed: ${result.error}`);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Profiles</h1>
          <button
            onClick={() => setShowAddModal(true)}
            disabled={providers.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            + Add Profile
          </button>
        </div>

        {providers.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">Please add a provider first before creating profiles.</p>
          </div>
        )}

        {loading && <p className="text-gray-600">Loading profiles...</p>}
        {error && <p className="text-red-600">Error: {error}</p>}

        {!loading && !error && profiles.length === 0 && providers.length > 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 mb-4">No profiles yet. Create your first profile!</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {profiles.map((profile) => (
            <div key={profile.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{profile.name}</h3>
                  <span className={`inline-block px-2 py-1 text-xs font-medium rounded mt-1 ${
                    profile.type === 'ADMIN' ? 'bg-purple-100 text-purple-800' :
                    profile.type === 'KID' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {profile.type}
                  </span>
                </div>
                {profile.pin && <span className="text-xl">🔒</span>}
              </div>

              <div className="space-y-2 text-sm">
                {profile.ageRating && (
                  <div>
                    <span className="text-gray-600">Max Age Rating:</span>
                    <p className="text-gray-900">{profile.ageRating}+</p>
                  </div>
                )}
                <div>
                  <span className="text-gray-600">Created:</span>
                  <p className="text-gray-900">{new Date(profile.createdAt).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="mt-4">
                <button
                  onClick={() => handleDelete(profile.id, profile.name)}
                  className="w-full px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Add Profile</h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Provider *
                  </label>
                  <select
                    required
                    value={formData.providerId}
                    onChange={(e) => setFormData({ ...formData, providerId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select a provider</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Profile Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Admin Profile"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Profile Type *
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="KID">Kid</option>
                    <option value="GUEST">Guest</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PIN (optional)
                  </label>
                  <input
                    type="password"
                    value={formData.pin}
                    onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="4-digit PIN"
                    maxLength={4}
                  />
                </div>

                {formData.type === 'KID' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Age Rating
                    </label>
                    <input
                      type="number"
                      value={formData.ageRating}
                      onChange={(e) => setFormData({ ...formData, ageRating: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="13"
                      min="0"
                      max="21"
                    />
                    <p className="text-xs text-gray-500 mt-1">Content above this rating will be filtered</p>
                  </div>
                )}

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Add Profile
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
