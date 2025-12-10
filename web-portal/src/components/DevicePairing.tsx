'use client'

import { useEffect, useState } from 'react'
import { X, Smartphone, CheckCircle, Loader } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'
import { pairingService } from '@/services/pairingService'

interface DevicePairingProps {
  onClose: () => void
}

export default function DevicePairing({ onClose }: DevicePairingProps) {
  const [pairingCode, setPairingCode] = useState('')
  const [paired, setPaired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [deviceName, setDeviceName] = useState('')

  useEffect(() => {
    generatePairingCode()
  }, [])

  const generatePairingCode = async () => {
    try {
      const response = await pairingService.createPairingSession()
      setPairingCode(response.code)
      setLoading(false)
      startPairingListener(response.code)
    } catch (error) {
      console.error('Failed to create pairing session:', error)
      toast.error('Failed to generate pairing code')
      setLoading(false)
    }
  }

  const startPairingListener = (code: string) => {
    // Poll every 3 seconds to check if device paired
    const interval = setInterval(async () => {
      try {
        const status = await pairingService.checkPairingStatus(code)
        if (status.paired) {
          setPaired(true)
          setDeviceName(status.deviceName || 'Android TV')
          toast.success('Device paired successfully!')
          clearInterval(interval)
        }
      } catch (error) {
        // Continue polling on error
      }
    }, 3000)

    // Stop polling after 10 minutes
    setTimeout(() => clearInterval(interval), 600000)

    return () => clearInterval(interval)
  }

  const pairingUrl = `iptv://pair?code=${pairingCode}&server=${encodeURIComponent(
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
  )}`

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 border border-white/20 rounded-2xl p-8 max-w-md w-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Pair TV Device</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <Loader className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Generating pairing code...</p>
          </div>
        ) : paired ? (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-2xl font-bold mb-2">Device Paired!</h3>
            <p className="text-gray-400 mb-6">
              Your TV device has been successfully connected and can now access your providers.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Instructions */}
            <div className="mb-6">
              <div className="flex items-start space-x-3 mb-3">
                <Smartphone className="w-6 h-6 text-blue-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="font-semibold mb-1">Step 1: Open IPTV App on TV</p>
                  <p className="text-sm text-gray-400">
                    Launch the IPTV Central app on your Android TV device
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Smartphone className="w-6 h-6 text-blue-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="font-semibold mb-1">Step 2: Scan QR Code</p>
                  <p className="text-sm text-gray-400">
                    Use your TV remote to scan this QR code or enter the pairing code manually
                  </p>
                </div>
              </div>
            </div>

            {/* QR Code */}
            <div className="bg-white p-6 rounded-xl mb-4 flex justify-center">
              <QRCodeSVG value={pairingUrl} size={200} />
            </div>

            {/* Pairing Code */}
            <div className="text-center mb-6">
              <p className="text-sm text-gray-400 mb-2">Or enter this code manually:</p>
              <div className="bg-white/10 border-2 border-blue-500 rounded-lg py-4 px-6">
                <span className="text-3xl font-mono font-bold tracking-widest">
                  {pairingCode}
                </span>
              </div>
            </div>

            {/* Status */}
            <div className="text-center">
              <Loader className="w-6 h-6 text-blue-500 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-400">Waiting for device to connect...</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
