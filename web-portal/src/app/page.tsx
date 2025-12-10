'use client'

import { useRouter } from 'next/navigation'
import { Tv2, Download, LogIn, Smartphone, Globe, Zap } from 'lucide-react'

export default function LandingPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-black/30 backdrop-blur-lg border-b border-white/10 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Tv2 className="w-8 h-8 text-blue-500" />
            <span className="text-2xl font-bold text-white">IPTV Central</span>
          </div>
          <button
            onClick={() => router.push('/auth/login')}
            className="flex items-center space-x-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <LogIn className="w-5 h-5" />
            <span>Sign In</span>
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto text-center">
          <div className="animate-fade-in">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
              Centralized IPTV Management
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 mb-12 max-w-3xl mx-auto">
              Connect once, stream everywhere. Manage all your IPTV providers from one beautiful dashboard.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a
                href={process.env.NEXT_PUBLIC_APK_DOWNLOAD_URL || '#'}
                className="flex items-center space-x-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl transition-all transform hover:scale-105 shadow-lg shadow-blue-500/50"
              >
                <Download className="w-6 h-6" />
                <span className="text-lg font-semibold">Download Android TV App</span>
              </a>
              
              <button
                onClick={() => router.push('/auth/register')}
                className="flex items-center space-x-3 px-8 py-4 bg-white/10 hover:bg-white/20 backdrop-blur-lg border border-white/20 rounded-xl transition-all"
              >
                <LogIn className="w-6 h-6" />
                <span className="text-lg font-semibold">Get Started Free</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-black/20">
        <div className="container mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16">Why Choose IPTV Central?</h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Smartphone className="w-12 h-12 text-blue-500" />}
              title="Easy Setup"
              description="Connect your providers once on the web, instantly available on all your devices."
            />
            
            <FeatureCard
              icon={<Globe className="w-12 h-12 text-purple-500" />}
              title="Universal Support"
              description="Works with Stalker Portal, Xtream Codes, and M3U playlists."
            />
            
            <FeatureCard
              icon={<Zap className="w-12 h-12 text-green-500" />}
              title="Live Sync"
              description="QR code pairing syncs your TV instantly - no typing required."
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-4xl font-bold text-center mb-16">How It Works</h2>
          
          <div className="space-y-8">
            <Step
              number="1"
              title="Create Your Account"
              description="Sign up for free and access the web portal from any device."
            />
            
            <Step
              number="2"
              title="Add Your Providers"
              description="Connect your Stalker, Xtream, or M3U providers through our easy setup wizard."
            />
            
            <Step
              number="3"
              title="Manage Categories"
              description="Choose which categories to show on your TV - Live TV, Movies, Series."
            />
            
            <Step
              number="4"
              title="Pair Your TV"
              description="Scan the QR code on your TV app and start streaming instantly!"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="container mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Get Started?</h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Join thousands of users who simplified their IPTV experience with centralized management.
          </p>
          
          <button
            onClick={() => router.push('/auth/register')}
            className="px-10 py-4 bg-white text-blue-600 hover:bg-gray-100 rounded-xl text-lg font-semibold transition-all transform hover:scale-105"
          >
            Create Free Account
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 bg-black/30 border-t border-white/10">
        <div className="container mx-auto text-center text-gray-400">
          <p>&copy; 2024 IPTV Central. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-6 bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl hover:bg-white/10 transition-all">
      <div className="mb-4">{icon}</div>
      <h3 className="text-2xl font-bold mb-3">{title}</h3>
      <p className="text-gray-300">{description}</p>
    </div>
  )
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex items-start space-x-4">
      <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-xl font-bold">
        {number}
      </div>
      <div className="flex-1">
        <h3 className="text-2xl font-bold mb-2">{title}</h3>
        <p className="text-gray-300">{description}</p>
      </div>
    </div>
  )
}
