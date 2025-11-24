'use client';

import DashboardLayout from '@/components/dashboard/DashboardLayout';

export default function DashboardPage() {
  // Hardcoded user ID for now - will be replaced with auth later
  const userId = 'user-1';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Welcome Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to IPTV Platform</h1>
          <p className="text-gray-600">
            Manage your IPTV providers, profiles, and devices all in one place.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Providers</p>
                <p className="text-2xl font-bold text-gray-900">-</p>
              </div>
              <div className="text-3xl">📡</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Profiles</p>
                <p className="text-2xl font-bold text-gray-900">-</p>
              </div>
              <div className="text-3xl">👤</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Devices</p>
                <p className="text-2xl font-bold text-gray-900">-</p>
              </div>
              <div className="text-3xl">📱</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Last Sync</p>
                <p className="text-2xl font-bold text-gray-900">-</p>
              </div>
              <div className="text-3xl">🔄</div>
            </div>
          </div>
        </div>

        {/* Getting Started */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Getting Started</h2>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">1</span>
              <div>
                <p className="font-medium text-gray-900">Add a Provider</p>
                <p className="text-sm text-gray-600">Connect your Stalker, Xtream, or M3U provider</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">2</span>
              <div>
                <p className="font-medium text-gray-900">Create Profiles</p>
                <p className="text-sm text-gray-600">Set up Admin, Kid, or Guest profiles with parental controls</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">3</span>
              <div>
                <p className="font-medium text-gray-900">Sync Content</p>
                <p className="text-sm text-gray-600">Fetch channels, movies, and series from your provider</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">4</span>
              <div>
                <p className="font-medium text-gray-900">Register Devices</p>
                <p className="text-sm text-gray-600">Connect your TV apps and start streaming</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
