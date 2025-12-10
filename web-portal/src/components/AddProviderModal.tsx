'use client'

import { useState, useEffect } from 'react'
import { X, Server, Key, Link as LinkIcon, Loader, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { providerService, AddProviderRequest } from '@/services/providerService'

 interface AddProviderModalProps {
  onClose: () => void
  onSuccess: () => void
}

type ProviderType = 'STALKER' | 'XTREAM' | 'M3U'

// Generate random MAC address in 00:1A:79:XX:XX:XX format
const generateMacAddress = (): string => {
  const prefix = '00:1A:79' // Common MAG box prefix
  const randomBytes = Array.from({ length: 3 }, () => 
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()
  )
  return `${prefix}:${randomBytes.join(':')}` 
}

// Generate random serial number
const generateSerialNumber = (): string => {
  const numbers = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('')
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26)) // A-Z
  const numbers2 = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('')
  return `${numbers}${letter}${numbers2}` // e.g., "058357N656529"
}

// Get or create cached MAC for a URL
const getCachedMac = (url: string): string => {
  if (typeof window === 'undefined') return generateMacAddress()
  
  const cacheKey = `stalker_mac_${url}`
  let cached = localStorage.getItem(cacheKey)
  
  if (!cached) {
    cached = generateMacAddress()
    localStorage.setItem(cacheKey, cached)
  }
  
  return cached
}

// Remove cached MAC (called when successfully connected)
const removeCachedMac = (url: string) => {
  if (typeof window === 'undefined') return
  localStorage.removeItem(`stalker_mac_${url}`)
}

export default function AddProviderModal({ onClose, onSuccess }: AddProviderModalProps) {
  const [step, setStep] = useState(1)
  const [selectedType, setSelectedType] = useState<ProviderType | null>(null)
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [progressMessage, setProgressMessage] = useState('')
  const [progressCurrent, setProgressCurrent] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)

  const [formData, setFormData] = useState({
    name: '',
    url: '',
    // Stalker
    stalkerMac: '',
    stalkerSerial: generateSerialNumber(),
    stalkerAdid: 'd5441597521c851906613d3948d84b8b',
    // Xtream
    xtreamUsername: '',
    xtreamPassword: '',
    // M3U
    m3uUrl: '',
  })

  // Auto-generate MAC when URL changes for Stalker
  useEffect(() => {
    if (selectedType === 'STALKER' && formData.url) {
      const mac = getCachedMac(formData.url)
      setFormData(prev => ({ ...prev, stalkerMac: mac }))
    }
  }, [formData.url, selectedType])

  const handleTypeSelect = (type: ProviderType) => {
    setSelectedType(type)
    setStep(2)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setProgressMessage('')
    setProgressCurrent(0)
    setProgressTotal(0)

    try {
      if (selectedType === 'STALKER') {
        // Use complete setup flow for Stalker
        console.log('\n=== STALKER PROVIDER SETUP STARTED ===')
        setValidating(true)
        
        const onProgress = (current: number, total: number, message: string) => {
          setProgressCurrent(current)
          setProgressTotal(total)
          setProgressMessage(message)
          console.log(`[${current}/${total}] ${message}`)
        }

        try {
          const { provider, categoriesCount } = await providerService.setupStalkerProvider(
            formData.name,
            formData.url,
            formData.stalkerMac,
            formData.stalkerSerial,
            formData.stalkerAdid,
            onProgress
          )

          // Remove cached MAC since authentication succeeded
          if (typeof window !== 'undefined') {
            localStorage.removeItem(`stalker_mac_${formData.url}`)
            console.log('🗑️  Cached MAC removed')
          }

          console.log('\n✅ Provider setup complete!')
          toast.success(`${provider.name} added with ${categoriesCount} categories!`)
          onSuccess()
        } catch (setupError: any) {
          console.error('\n=== STALKER SETUP FAILED ===')
          console.error(setupError)
          throw new Error(`Stalker setup failed: ${setupError.message}`)
        } finally {
          setValidating(false)
        }
      } else if (selectedType === 'XTREAM') {
        const data: AddProviderRequest = {
          type: selectedType,
          name: formData.name,
          url: formData.url,
          xtreamUsername: formData.xtreamUsername,
          xtreamPassword: formData.xtreamPassword,
        }
        await providerService.addProvider(data)
        toast.success('Provider added successfully!')
        onSuccess()
      } else if (selectedType === 'M3U') {
        const data: AddProviderRequest = {
          type: selectedType,
          name: formData.name,
          url: formData.url,
          m3uUrl: formData.m3uUrl || formData.url,
        }
        await providerService.addProvider(data)
        toast.success('Provider added successfully!')
        onSuccess()
      }
    } catch (error: any) {
      console.error('\n❌ Failed to add provider:', error)
      toast.error(error.message || error.response?.data?.error || 'Failed to add provider')
    } finally {
      setLoading(false)
      setValidating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 border border-white/20 rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Add Provider</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Step 1: Select Type */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-gray-400 mb-6">Choose your provider type:</p>

            <button
              onClick={() => handleTypeSelect('STALKER')}
              className="w-full p-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left transition-all group"
            >
              <div className="flex items-center space-x-4">
                <Server className="w-10 h-10 text-blue-500 group-hover:scale-110 transition-transform" />
                <div>
                  <h3 className="text-xl font-bold mb-1">Stalker Portal</h3>
                  <p className="text-sm text-gray-400">MAG STB emulation portals</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleTypeSelect('XTREAM')}
              className="w-full p-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left transition-all group"
            >
              <div className="flex items-center space-x-4">
                <Key className="w-10 h-10 text-purple-500 group-hover:scale-110 transition-transform" />
                <div>
                  <h3 className="text-xl font-bold mb-1">Xtream Codes</h3>
                  <p className="text-sm text-gray-400">Username and password authentication</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleTypeSelect('M3U')}
              className="w-full p-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left transition-all group"
            >
              <div className="flex items-center space-x-4">
                <LinkIcon className="w-10 h-10 text-green-500 group-hover:scale-110 transition-transform" />
                <div>
                  <h3 className="text-xl font-bold mb-1">M3U Playlist</h3>
                  <p className="text-sm text-gray-400">Direct M3U playlist URL</p>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Step 2: Enter Details */}
        {step === 2 && selectedType && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Provider Name */}
            <div>
              <label className="block text-sm font-medium mb-2">Provider Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                placeholder="My IPTV Provider"
              />
            </div>

            {/* Stalker Fields */}
            {selectedType === 'STALKER' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Portal URL</label>
                  <input
                    type="url"
                    required
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                    placeholder="http://example.com/stalker_portal/"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">MAC Address</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      required
                      value={formData.stalkerMac}
                      onChange={(e) => {
                        const newMac = e.target.value
                        setFormData({ ...formData, stalkerMac: newMac })
                        if (formData.url) {
                          localStorage.setItem(`stalker_mac_${formData.url}`, newMac)
                        }
                      }}
                      className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:border-blue-500 focus:outline-none transition-colors font-mono"
                      placeholder="00:1A:79:XX:XX:XX"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newMac = generateMacAddress()
                        setFormData({ ...formData, stalkerMac: newMac })
                        if (formData.url) {
                          localStorage.setItem(`stalker_mac_${formData.url}`, newMac)
                        }
                        toast.success('New MAC generated')
                      }}
                      className="px-4 py-3 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                      title="Generate new MAC"
                    >
                      <RefreshCw className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Auto-generated and cached per URL. Click refresh to generate new or edit manually.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Serial Number</label>
                  <input
                    type="text"
                    required
                    readOnly
                    value={formData.stalkerSerial}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg font-mono"
                  />
                </div>
              </>
            )}

            {/* Xtream Fields */}
            {selectedType === 'XTREAM' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Server URL</label>
                  <input
                    type="url"
                    required
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                    placeholder="http://example.com:8080"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Username</label>
                  <input
                    type="text"
                    required
                    value={formData.xtreamUsername}
                    onChange={(e) => setFormData({ ...formData, xtreamUsername: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                    placeholder="username"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Password</label>
                  <input
                    type="password"
                    required
                    value={formData.xtreamPassword}
                    onChange={(e) => setFormData({ ...formData, xtreamPassword: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                    placeholder="password"
                  />
                </div>
              </>
            )}

            {/* M3U Fields */}
            {selectedType === 'M3U' && (
              <div>
                <label className="block text-sm font-medium mb-2">Playlist URL</label>
                <input
                  type="url"
                  required
                  value={formData.m3uUrl}
                  onChange={(e) => setFormData({ ...formData, m3uUrl: e.target.value, url: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                  placeholder="http://example.com/playlist.m3u"
                />
              </div>
            )}

            {/* Progress Indicator */}
            {(loading || validating) && progressMessage && (
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="flex items-center space-x-3 mb-2">
                  <Loader className="w-5 h-5 animate-spin text-blue-500" />
                  <span className="text-sm font-medium">{progressMessage}</span>
                </div>
                {progressTotal > 0 && (
                  <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-purple-500 h-full transition-all duration-300"
                      style={{ width: `${(progressCurrent / progressTotal) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Buttons */}
            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={loading || validating}
                className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Back
              </button>

              <button
                type="submit"
                disabled={loading || validating}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {validating ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>Setting up...</span>
                  </>
                ) : loading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Add Provider</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
