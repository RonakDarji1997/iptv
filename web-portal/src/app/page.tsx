'use client'

import { useRouter } from 'next/navigation'
import { Film, Tv, Radio, Download, LogIn, Smartphone, Globe, Zap } from 'lucide-react'

export default function LandingPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-black">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-black/95 backdrop-blur-sm border-b border-gray-800 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">S</span>
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">STREAMHUB</span>
          </div>
          <button
            onClick={() => router.push('/auth/login')}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold"
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 bg-gradient-to-b from-gray-900 to-black">
        <div className="container mx-auto text-center">
          <div className="animate-fade-in">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500">
              Your Entertainment Hub
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 mb-12 max-w-3xl mx-auto">
              Stream Movies, Series, and Live TV all in one beautiful platform. Connect once, enjoy everywhere.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button
                onClick={() => router.push('/auth/register')}
                className="flex items-center space-x-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl transition-all transform hover:scale-105 shadow-lg shadow-blue-500/50 text-white font-semibold"
              >
                <LogIn className="w-6 h-6" />
                <span className="text-lg">Get Started Free</span>
              </button>
              
              <button
                onClick={() => router.push('/browse')}
                className="flex items-center space-x-3 px-8 py-4 bg-white/10 hover:bg-white/20 backdrop-blur-lg border border-white/20 rounded-xl transition-all text-white font-semibold"
              >
                <Film className="w-6 h-6" />
                <span className="text-lg">Explore Content</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16 text-white">Why Choose StreamHub?</h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Film className="w-12 h-12 text-blue-500" />}
              title="Movies"
              description="Thousands of movies at your fingertips. From classics to latest releases."
            />
            
            <FeatureCard
              icon={<Tv className="w-12 h-12 text-purple-500" />}
              title="TV Series"
              description="Binge-worthy series organized by genre. Never miss an episode."
            />
            
            <FeatureCard
              icon={<Radio className="w-12 h-12 text-pink-500" />}
              title="Live TV"
              description="Watch live channels from around the world, all in one place."
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 bg-gradient-to-b from-black to-gray-900">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-4xl font-bold text-center mb-16 text-white">How It Works</h2>
          
          <div className="space-y-8">
            <Step
              number="1"
              title="Create Your Account"
              description="Sign up for free and access StreamHub from any device."
            />
            
            <Step
              number="2"
              title="Add Your Providers"
              description="Connect your IPTV providers through our secure setup wizard."
            />
            
            <Step
              number="3"
              title="Browse Content"
              description="Explore thousands of movies, series, and live TV channels."
            />
            
            <Step
              number="4"
              title="Start Streaming"
              description="Watch on web, mobile, or TV - your content syncs everywhere!"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600">
        <div className="container mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6 text-white">Ready to Get Started?</h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Join thousands of users streaming their favorite content on StreamHub.
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
      <footer className="py-8 px-4 bg-black border-t border-gray-800">
        <div className="container mx-auto text-center text-gray-400">
          <p className="text-2xl font-bold text-white mb-4">STREAMHUB</p>
          <p className="text-sm">Your Entertainment Hub</p>
          <p className="text-xs mt-4">© 2025 StreamHub. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-8 bg-gray-900 border border-gray-800 rounded-xl hover:bg-gray-800 transition-all hover:border-gray-700">
      <div className="mb-4">{icon}</div>
      <h3 className="text-2xl font-bold mb-3 text-white">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  )
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex items-start space-x-4">
      <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-xl font-bold text-white">
        {number}
      </div>
      <div className="flex-1">
        <h3 className="text-2xl font-bold mb-2 text-white">{title}</h3>
        <p className="text-gray-400">{description}</p>
      </div>
    </div>
  )
}
