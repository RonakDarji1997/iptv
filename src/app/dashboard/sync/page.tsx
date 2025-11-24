'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useProviders } from '@/hooks/useProviders';

export default function SyncPage() {
  const userId = 'user-1';
  const { providers, loading, error, syncProvider } = useProviders(userId);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const handleSync = async (providerId: string) => {
    setSyncing(providerId);
    const result = await syncProvider(providerId);
    setSyncing(null);
    
    setSyncResults({
      ...syncResults,
      [providerId]: {
        success: result.success,
        message: result.success 
          ? 'Sync completed successfully!' 
          : `Sync failed: ${result.error}`,
      },
    });

    // Clear message after 5 seconds
    setTimeout(() => {
      setSyncResults((prev) => {
        const newResults = { ...prev };
        delete newResults[providerId];
        return newResults;
      });
    }, 5000);
  };

  const handleSyncAll = async () => {
    for (const provider of providers) {
      if (provider.isActive) {
        await handleSync(provider.id);
      }
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Sync Status</h1>
          <button
            onClick={handleSyncAll}
            disabled={providers.length === 0 || syncing !== null}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            🔄 Sync All
          </button>
        </div>

        {providers.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">No providers to sync. Please add a provider first.</p>
          </div>
        )}

        {loading && <p className="text-gray-600">Loading providers...</p>}
        {error && <p className="text-red-600">Error: {error}</p>}

        <div className="space-y-4">
          {providers.map((provider) => (
            <div key={provider.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-bold text-gray-900">{provider.name}</h3>
                    <span className={`px-2 py-1 text-xs rounded ${provider.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {provider.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">
                      {provider.type}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Last Sync:</span>
                      <p className="text-gray-900">
                        {provider.lastSync 
                          ? new Date(provider.lastSync).toLocaleString()
                          : 'Never'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-600">URL:</span>
                      <p className="text-gray-900 truncate">{provider.url}</p>
                    </div>
                    {provider.stalkerMac && (
                      <div>
                        <span className="text-gray-600">MAC:</span>
                        <p className="text-gray-900 font-mono">{provider.stalkerMac}</p>
                      </div>
                    )}
                  </div>

                  {syncResults[provider.id] && (
                    <div className={`mt-3 p-3 rounded ${
                      syncResults[provider.id].success 
                        ? 'bg-green-50 text-green-800' 
                        : 'bg-red-50 text-red-800'
                    }`}>
                      {syncResults[provider.id].message}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleSync(provider.id)}
                  disabled={syncing === provider.id || !provider.isActive}
                  className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {syncing === provider.id ? (
                    <span className="flex items-center">
                      <span className="animate-spin mr-2">⏳</span>
                      Syncing...
                    </span>
                  ) : (
                    '🔄 Sync Now'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Info Panel */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-bold text-blue-900 mb-2">About Sync</h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>• Syncing fetches all categories, channels, movies, and series from your provider</li>
            <li>• Metadata is stored in the database for fast access</li>
            <li>• Snapshots are automatically generated for each profile after sync</li>
            <li>• TV apps download these snapshots for instant UI loading</li>
            <li>• Sync regularly to keep content up-to-date (recommended: daily)</li>
          </ul>
        </div>
      </div>
    </DashboardLayout>
  );
}
