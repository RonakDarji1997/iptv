'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { authService } from '@/services/authService'
import { providerService, Provider } from '@/services/providerService'
import AddProviderModal from '@/components/AddProviderModal'
import CategoryManager from '@/components/CategoryManager'
import { Settings, User, Bell, Shield, Palette, Info, Tv2, Plus, RefreshCw, Trash2, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'

function SettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabFromUrl = searchParams.get('tab') || 'general'
  const [activeTab, setActiveTab] = useState(tabFromUrl)
  const [userEmail, setUserEmail] = useState('')
  const [providers, setProviders] = useState<Provider[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [settings, setSettings] = useState({
    autoplay: true,
    quality: 'auto',
    subtitles: true,
    notifications: true,
    theme: 'dark'
  })

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push('/auth/login')
      return
    }

    // Set active tab from URL parameter
    const tabParam = searchParams.get('tab')
    if (tabParam && ['general', 'providers', 'account', 'playback', 'notifications', 'about'].includes(tabParam)) {
      setActiveTab(tabParam)
    }

    // Load user data
    const token = authService.getToken()
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setUserEmail(payload.email || 'user@streamhub.com')
      } catch (e) {
        setUserEmail('user@streamhub.com')
      }
    }

    // Load settings from localStorage
    const savedSettings = localStorage.getItem('app_settings')
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings))
    }

    // Load providers
    loadProviders()
  }, [router, searchParams])

  const loadProviders = async () => {
    try {
      const data = await providerService.getProviders()
      setProviders(data)
    } catch (error: any) {
      console.error('Failed to load providers:', error)
    }
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

  const handleSaveSetting = (key: string, value: any) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    localStorage.setItem('app_settings', JSON.stringify(newSettings))
    toast.success('Setting saved')
  }

  const handleLogout = () => {
    authService.logout()
    router.push('/auth/login')
  }

  const tabs = [
    { id: 'general', name: 'General', icon: Settings },
    { id: 'providers', name: 'Providers', icon: Tv2 },
    { id: 'account', name: 'Account', icon: User },
    { id: 'playback', name: 'Playback', icon: Palette },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'about', name: 'About', icon: Info },
  ]

  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      
      <div className="pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8">Settings</h1>

          {/* Mobile Tab Selector */}
          <div className="lg:hidden mb-6">
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
              className="w-full bg-gray-900 text-white px-4 py-3 rounded-lg border border-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
            {/* Sidebar - Desktop Only */}
            <div className="hidden lg:block w-64 flex-shrink-0">
              <nav className="space-y-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                        activeTab === tab.id
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5 mr-3" />
                      {tab.name}
                    </button>
                  )
                })}
              </nav>
            </div>

            {/* Content */}
            <div className="flex-1 bg-gray-900 rounded-lg p-4 sm:p-6">
              {/* General Tab */}
              {activeTab === 'general' && (
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white mb-6">General Settings</h2>
                  
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h3 className="text-white font-medium">Theme</h3>
                        <p className="text-gray-400 text-sm">Choose your preferred theme</p>
                      </div>
                      <select
                        value={settings.theme}
                        onChange={(e) => handleSaveSetting('theme', e.target.value)}
                        className="bg-gray-800 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="dark">Dark</option>
                        <option value="light">Light</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Providers Tab */}
              {activeTab === 'providers' && (
                <div>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold text-white">Your Providers</h2>
                      <p className="text-gray-400 text-sm">Manage your IPTV providers and categories</p>
                    </div>
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg transition-all whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Provider</span>
                    </button>
                  </div>

                  {providers.length === 0 ? (
                    <div className="text-center py-12 bg-gray-800/50 rounded-lg">
                      <Tv2 className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                      <h3 className="text-xl font-bold mb-2">No Providers Yet</h3>
                      <p className="text-gray-400 mb-4">Add your first IPTV provider to get started</p>
                      <button
                        onClick={() => setShowAddModal(true)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                      >
                        Add Provider
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {providers.map((provider) => (
                        <div
                          key={provider.id}
                          className="bg-gray-800/50 rounded-lg p-4 hover:bg-gray-800 transition-all"
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <h3 className="text-lg font-bold mb-1">{provider.name}</h3>
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

                          <div className="mb-3 space-y-2">
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Server URL:</p>
                              <p className="text-sm text-gray-300 truncate font-mono">
                                {provider.server_url || provider.url || 'Not configured'}
                              </p>
                            </div>
                            
                            {provider.mac_address && (
                              <div>
                                <p className="text-xs text-gray-500 mb-1">MAC Address:</p>
                                <p className="text-sm text-blue-400 font-mono">
                                  {provider.mac_address}
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
                              title="Sync"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleDelete(provider.id)}
                              className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Account Tab */}
              {activeTab === 'account' && (
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white mb-6">Account Information</h2>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="block text-gray-400 text-sm mb-2">Email</label>
                      <input
                        type="email"
                        value={userEmail}
                        disabled
                        className="w-full bg-gray-800 text-gray-500 px-4 py-2 rounded-lg"
                      />
                    </div>

                    <div className="pt-4 border-t border-gray-800">
                      <button
                        onClick={handleLogout}
                        className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg transition-colors"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Playback Tab */}
              {activeTab === 'playback' && (
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white mb-6">Playback Settings</h2>
                  
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h3 className="text-white font-medium">Autoplay</h3>
                        <p className="text-gray-400 text-sm">Automatically play next episode</p>
                      </div>
                      <button
                        onClick={() => handleSaveSetting('autoplay', !settings.autoplay)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.autoplay ? 'bg-blue-600' : 'bg-gray-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            settings.autoplay ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h3 className="text-white font-medium">Video Quality</h3>
                        <p className="text-gray-400 text-sm">Default playback quality</p>
                      </div>
                      <select
                        value={settings.quality}
                        onChange={(e) => handleSaveSetting('quality', e.target.value)}
                        className="bg-gray-800 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto"
                      >
                        <option value="auto">Auto</option>
                        <option value="1080p">1080p</option>
                        <option value="720p">720p</option>
                        <option value="480p">480p</option>
                      </select>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h3 className="text-white font-medium">Subtitles</h3>
                        <p className="text-gray-400 text-sm">Enable subtitles by default</p>
                      </div>
                      <button
                        onClick={() => handleSaveSetting('subtitles', !settings.subtitles)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.subtitles ? 'bg-blue-600' : 'bg-gray-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            settings.subtitles ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Notifications Tab */}
              {activeTab === 'notifications' && (
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white mb-6">Notification Settings</h2>
                  
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h3 className="text-white font-medium">Push Notifications</h3>
                        <p className="text-gray-400 text-sm">Receive notifications about new content</p>
                      </div>
                      <button
                        onClick={() => handleSaveSetting('notifications', !settings.notifications)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.notifications ? 'bg-blue-600' : 'bg-gray-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            settings.notifications ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* About Tab */}
              {activeTab === 'about' && (
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white mb-6">About StreamHub</h2>
                  
                  <div className="space-y-4">
                    <div className="flex items-center space-x-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                        <span className="text-white text-2xl font-bold">S</span>
                      </div>
                      <div>
                        <h3 className="text-white font-bold text-xl">StreamHub</h3>
                        <p className="text-gray-400">Version 1.0.0</p>
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t border-gray-800">
                      <p className="text-gray-400 text-sm">
                        Your premium streaming platform for movies, series, and live TV.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
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
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black">
        <Navbar />
        <div className="pt-16 flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
        </div>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  )
}
