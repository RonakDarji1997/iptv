'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useDevices } from '@/hooks/useDevices';
import { useProviders } from '@/hooks/useProviders';

export default function DevicesPage() {
  const userId = 'user-1';
  const { providers } = useProviders(userId);
  const { devices, loading, error, addDevice } = useDevices(userId);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    providerId: '',
    deviceName: '',
    mac: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await addDevice(formData);
    if (result.success) {
      setShowAddModal(false);
      setFormData({ providerId: '', deviceName: '', mac: '' });
    } else {
      alert(`Error: ${result.error}`);
    }
  };

  const getProviderName = (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    return provider?.name || 'Unknown';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
          <button
            onClick={() => setShowAddModal(true)}
            disabled={providers.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            + Register Device
          </button>
        </div>

        {providers.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">Please add a provider first before registering devices.</p>
          </div>
        )}

        {loading && <p className="text-gray-600">Loading devices...</p>}
        {error && <p className="text-red-600">Error: {error}</p>}

        {!loading && !error && devices.length === 0 && providers.length > 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 mb-4">No devices registered yet.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices.map((device) => (
            <div key={device.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{device.deviceName}</h3>
                  <span className="inline-block px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800 mt-1">
                    {getProviderName(device.providerId)}
                  </span>
                </div>
                <span className="text-2xl">📱</span>
              </div>

              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-600">MAC Address:</span>
                  <p className="text-gray-900 font-mono">{device.mac}</p>
                </div>
                {device.stbId && (
                  <div>
                    <span className="text-gray-600">STB ID:</span>
                    <p className="text-gray-900">{device.stbId}</p>
                  </div>
                )}
                {device.lastActive && (
                  <div>
                    <span className="text-gray-600">Last Active:</span>
                    <p className="text-gray-900">{new Date(device.lastActive).toLocaleString()}</p>
                  </div>
                )}
                <div>
                  <span className="text-gray-600">Registered:</span>
                  <p className="text-gray-900">{new Date(device.createdAt).toLocaleDateString()}</p>
                </div>
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
                <h2 className="text-xl font-bold text-gray-900">Register Device</h2>
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
                    Device Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.deviceName}
                    onChange={(e) => setFormData({ ...formData, deviceName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Living Room TV"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    MAC Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.mac}
                    onChange={(e) => setFormData({ ...formData, mac: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="00:1A:79:XX:XX:XX"
                  />
                  <p className="text-xs text-gray-500 mt-1">Use the provider's MAC address</p>
                </div>

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
                    Register
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
