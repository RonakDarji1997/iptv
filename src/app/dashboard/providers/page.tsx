'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useProviders } from '@/hooks/useProviders';

interface SyncStatus {
  activeJob: {
    id: string;
    status: string;
    totalItems: number;
    processedItems: number;
    moviesCount: number;
    seriesCount: number;
    channelsCount: number;
    startedAt: string;
  } | null;
}

export default function ProvidersPage() {
  const userId = 'user-1'; // Hardcoded for now
  const { providers, loading, error, addProvider, updateProvider, deleteProvider, syncProvider } = useProviders(userId);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<Record<string, SyncStatus>>({});
  const [formData, setFormData] = useState({
    type: 'STALKER',
    name: '',
    url: '',
    stalkerMac: '',
    stalkerBearer: '',
    stalkerAdid: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await addProvider(formData);
    if (result.success) {
      setShowAddModal(false);
      setFormData({
        type: 'STALKER',
        name: '',
        url: '',
        stalkerMac: '',
        stalkerBearer: '',
        stalkerAdid: '',
      });
    } else {
      alert(`Error: ${result.error}`);
    }
  };

  const handleSync = async (providerId: string, mode: 'full' | 'incremental' | 'auto' = 'auto') => {
    setSyncing(providerId);
    try {
      const response = await fetch(`/api/providers/${providerId}/sync?mode=${mode}`, {
        method: 'POST',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start sync');
      }
      const data = await response.json();
      console.log('Sync started:', data);
    } catch (err) {
      alert(`Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSyncing(null);
    }
  };

  const handleCancelSync = async (providerId: string) => {
    try {
      const response = await fetch(`/api/providers/${providerId}/sync/cancel`, {
        method: 'POST',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to cancel sync');
      }
      alert('Sync cancelled');
    } catch (err) {
      alert(`Cancel failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDelete = async (providerId: string, providerName: string) => {
    if (!confirm(`Delete provider "${providerName}"? This will remove all associated data.`)) return;
    const result = await deleteProvider(providerId);
    if (!result.success) {
      alert(`Delete failed: ${result.error}`);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Providers</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Add Provider
          </button>
        </div>

        {/* Loading/Error States */}
        {loading && <p className="text-gray-600">Loading providers...</p>}
        {error && <p className="text-red-600">Error: {error}</p>}

        {/* Providers List */}
        {!loading && !error && providers.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 mb-4">No providers yet. Add your first provider to get started!</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {providers.map((provider) => (
            <div key={provider.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{provider.name}</h3>
                  <span className="inline-block px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800 mt-1">
                    {provider.type}
                  </span>
                </div>
                <span className={`px-2 py-1 text-xs rounded ${provider.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {provider.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-600">URL:</span>
                  <p className="text-gray-900 truncate">{provider.url}</p>
                </div>
                {provider.stalkerMac && (
                  <div>
                    <span className="text-gray-600">MAC:</span>
                    <p className="text-gray-900">{provider.stalkerMac}</p>
                  </div>
                )}
                {provider.lastSync && (
                  <div>
                    <span className="text-gray-600">Last Sync:</span>
                    <p className="text-gray-900">{new Date(provider.lastSync).toLocaleString()}</p>
                  </div>
                )}
              </div>

              {/* Sync Progress */}
              {syncStatus[provider.id]?.activeJob && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-blue-900">Syncing...</span>
                    <span className="text-xs text-blue-700">
                      {syncStatus[provider.id].activeJob.processedItems.toLocaleString()} / {syncStatus[provider.id].activeJob.totalItems.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, (syncStatus[provider.id].activeJob.processedItems / syncStatus[provider.id].activeJob.totalItems) * 100)}%`
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-blue-700">
                    <span>🎬 {syncStatus[provider.id].activeJob.moviesCount} movies</span>
                    <span>📺 {syncStatus[provider.id].activeJob.seriesCount} series</span>
                    <span>📡 {syncStatus[provider.id].activeJob.channelsCount} channels</span>
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-col space-y-2">
                {/* Sync Controls */}
                {syncStatus[provider.id]?.activeJob ? (
                  <button
                    onClick={() => handleCancelSync(provider.id)}
                    className="w-full px-3 py-2 text-sm bg-orange-600 text-white rounded hover:bg-orange-700"
                  >
                    ⏸️ Cancel Sync
                  </button>
                ) : (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleSync(provider.id, 'auto')}
                      disabled={syncing === provider.id}
                      className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {syncing === provider.id ? '⏳' : '🔄'} Auto
                    </button>
                    <button
                      onClick={() => handleSync(provider.id, 'full')}
                      disabled={syncing === provider.id}
                      className="flex-1 px-3 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                    >
                      ♻️ Full
                    </button>
                    <button
                      onClick={() => handleSync(provider.id, 'incremental')}
                      disabled={syncing === provider.id}
                      className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      ⚡ Inc
                    </button>
                  </div>
                )}
                {/* Delete Button */}
                <button
                  onClick={() => handleDelete(provider.id, provider.name)}
                  className="w-full px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                >
                  🗑️ Delete Provider
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Provider Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Add Provider</h2>
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
                    Provider Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="STALKER">Stalker</option>
                    <option value="XTREAM">Xtream</option>
                    <option value="M3U">M3U</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Provider Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="My IPTV Provider"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Portal URL *
                  </label>
                  <input
                    type="url"
                    required
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="http://example.com/stalker_portal/"
                  />
                </div>

                {formData.type === 'STALKER' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        MAC Address (optional - will auto-generate)
                      </label>
                      <input
                        type="text"
                        value={formData.stalkerMac}
                        onChange={(e) => setFormData({ ...formData, stalkerMac: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="00:1A:79:XX:XX:XX"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Bearer Token *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.stalkerBearer}
                        onChange={(e) => setFormData({ ...formData, stalkerBearer: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="1E75E91204660B7A..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ADID (optional)
                      </label>
                      <input
                        type="text"
                        value={formData.stalkerAdid}
                        onChange={(e) => setFormData({ ...formData, stalkerAdid: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="06c140f97c..."
                      />
                    </div>
                  </>
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
                    Add Provider
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
