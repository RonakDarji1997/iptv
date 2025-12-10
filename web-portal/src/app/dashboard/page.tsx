'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tv2, LogOut, Plus, RefreshCw, Settings, Trash2, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { authService } from '@/services/authService'
import { providerService, Provider, Category } from '@/services/providerService'
import AddProviderModal from '@/components/AddProviderModal'
import CategoryManager from '@/components/CategoryManager'
import DevicePairing from '@/components/DevicePairing'

export default function DashboardPage() {
  const router = useRouter()
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [showDevicePairing, setShowDevicePairing] = useState(false)

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push('/auth/login')
      return
    }

    loadProviders()
  }, [router])

  const loadProviders = async () => {
    try {
      setLoading(true)
      const data = await providerService.getProviders()
      setProviders(data)
    } catch (error: any) {
      toast.error('Failed to load providers')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    authService.logout()
    router.push('/')
  }

  const handleSync = async (providerId: string) => {
    const loadingToast = toast.loading('🔄 Syncing categories...')
    
    try {
      const stats = await providerService.syncProvider(providerId)
      toast.dismiss(loadingToast)
      toast.success(
        `✅ Sync complete!\n${stats.categories} total categories\n${stats.live} Live TV | ${stats.movies} Movies | ${stats.series} Series`,
        { duration: 5000 }
      )
      loadProviders()
    } catch (error: any) {
      toast.dismiss(loadingToast)
      toast.error(`Failed to sync: ${error.message}`)
    }
  }

  const handleDelete = async (providerId: string) => {
    if (!confirm('Are you sure you want to delete this provider?')) return

    try {
      await providerService.deleteProvider(providerId)
      toast.success('Provider deleted')
      loadProviders()
    } catch (error: any) {
      toast.error('Failed to delete provider')
    }
  }

  const handleManageCategories = (provider: Provider) => {
    setSelectedProvider(provider)
    setShowCategoryManager(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
      {/* Navigation */}
      <nav className="bg-black/30 backdrop-blur-lg border-b border-white/10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Tv2 className="w-8 h-8 text-blue-500" />
            <span className="text-2xl font-bold text-white">IPTV Central</span>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowDevicePairing(true)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center space-x-2"
            >
              <Tv2 className="w-5 h-5" />
              <span>Pair Device</span>
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Your Providers</h1>
            <p className="text-gray-400">Manage your IPTV providers and categories</p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg transition-all"
          >
            <Plus className="w-5 h-5" />
            <span>Add Provider</span>
          </button>
        </div>

        {/* Providers List */}
        {loading ? (
          <div className="text-center py-20">
            <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading providers...</p>
          </div>
        ) : providers.length === 0 ? (
          <div className="text-center py-20 bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl">
            <Tv2 className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <h3 className="text-2xl font-bold mb-2">No Providers Yet</h3>
            <p className="text-gray-400 mb-6">Add your first IPTV provider to get started</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Add Provider
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {providers.map((provider) => (
              <div
                key={provider.id}
                className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-1">{provider.name}</h3>
                    <p className="text-sm text-gray-400 capitalize">{provider.type}</p>
                  </div>

                  <div className="flex items-center space-x-2">
                    {(provider.isActive ?? provider.is_active ?? true) ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <X className="w-5 h-5 text-red-500" />
                    )}
                  </div>
                </div>

                <div className="mb-4 space-y-2">
                  {/* Server URL */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Server URL:</p>
                    <p className="text-sm text-gray-300 truncate font-mono">
                      {provider.server_url || provider.url || 'Not configured'}
                    </p>
                  </div>
                  
                  {/* MAC Address */}
                  {provider.mac_address && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">MAC Address:</p>
                      <p className="text-sm text-blue-400 font-mono">
                        {provider.mac_address}
                      </p>
                    </div>
                  )}
                  
                  {/* Last Sync */}
                  {provider.lastSync && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Last Sync:</p>
                      <p className="text-xs text-gray-400">
                        {new Date(provider.lastSync).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={() => handleManageCategories(provider)}
                    className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    <span className="text-sm">Categories</span>
                  </button>

                  <button
                    onClick={() => handleSync(provider.id)}
                    className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDelete(provider.id)}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddProviderModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false)
            loadProviders()
          }}
        />
      )}

      {showCategoryManager && selectedProvider && (
        <CategoryManager
          provider={selectedProvider}
          onClose={() => {
            setShowCategoryManager(false)
            setSelectedProvider(null)
          }}
        />
      )}

      {showDevicePairing && (
        <DevicePairing onClose={() => setShowDevicePairing(false)} />
      )}
    </div>
  )
}
