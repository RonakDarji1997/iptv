'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Film, Tv, Radio, Search, User, LogOut, Settings, Home } from 'lucide-react'
import { authService } from '@/services/authService'

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setIsAuthenticated(authService.isAuthenticated())
  }, [])

  const navItems = [
    { name: 'HOME', href: '/home', icon: Home },
    { name: 'LIVE TV', href: '/browse/live', icon: Radio },
    { name: 'MOVIES', href: '/browse/movies', icon: Film },
    { name: 'SERIES', href: '/browse/series', icon: Tv },
    { name: 'SETTINGS', href: '/settings', icon: Settings },
  ]

  const handleLogout = async () => {
    await authService.logout()
    router.push('/')
  }

  // Prevent hydration mismatch by not rendering auth-dependent content until mounted
  if (!mounted) {
    return (
      <>
        {/* Top Logo Bar - Desktop only */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-black border-b border-gray-800 hidden md:block">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <Link href="/home" className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-xl">S</span>
                </div>
                <span className="ml-2 text-white font-bold text-xl tracking-tight">
                  STREAMHUB
                </span>
              </Link>

              {/* Placeholder for auth buttons to prevent layout shift */}
              <div className="flex items-center space-x-4">
                <div className="w-20 h-10"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Floating Navigation */}
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
          <nav className="bg-gray-900/40 backdrop-blur-2xl border border-white/20 rounded-full px-6 py-3 shadow-2xl">
            <div className="flex items-center space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex flex-col items-center px-4 py-2 rounded-full transition-all ${
                      isActive
                        ? 'bg-yellow-500 text-black'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider mt-1">
                      {item.name}
                    </span>
                  </Link>
                )
              })}
            </div>
          </nav>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Top Logo Bar - All screens */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-14 md:h-16">
            {/* Logo */}
            <Link href="/home" className="flex items-center space-x-1.5 sm:space-x-2">
              <div className="w-7 h-7 sm:w-7 sm:h-7 md:w-8 md:h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-base sm:text-lg md:text-xl">S</span>
              </div>
              <span className="text-white font-bold text-base sm:text-lg md:text-xl tracking-tight">
                STREAMHUB
              </span>
            </Link>

            {/* Right Side Actions */}
            <div className="flex items-center space-x-3 sm:space-x-4">
              {isAuthenticated ? (
                <>
                  {/* Search Button */}
                  <Link
                    href="/search"
                    className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
                  >
                    <Search className="w-4 h-4 sm:w-5 sm:h-5" />
                  </Link>

                  {/* User Menu */}
                  <div className="relative">
                    <button
                      onClick={() => setShowUserMenu(!showUserMenu)}
                      className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
                    >
                      <User className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>

                    {showUserMenu && (
                      <div className="absolute right-0 top-full mt-2 w-40 sm:w-48 bg-gray-900 rounded-lg shadow-xl border border-gray-800 py-2">
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center space-x-2 px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-300 hover:bg-gray-800 transition-colors"
                        >
                          <LogOut className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <Link
                  href="/auth/login"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-semibold"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation Bar - Floating with rounded corners */}
      {isAuthenticated && (
        <div className="fixed bottom-3 sm:bottom-4 left-3 right-3 sm:left-4 sm:right-4 z-50 flex justify-center">
          <nav className="bg-gray-900/40 backdrop-blur-2xl rounded-full border border-white/20 shadow-2xl px-3 sm:px-4 py-2.5 sm:py-2.5">
            <div className="flex items-center space-x-1 sm:space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex flex-col items-center justify-center px-3 sm:px-5 py-2 sm:py-2 rounded-full transition-all ${
                      isActive 
                        ? 'text-yellow-500 bg-gray-800' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                    }`}
                  >
                    {Icon && <Icon className="w-5 h-5 sm:w-5 sm:h-5" />}
                    <span className="hidden sm:block text-[10px] font-medium mt-0.5 uppercase tracking-wide">{item.name}</span>
                  </Link>
                )
              })}
            </div>
          </nav>
        </div>
      )}
    </>
  )
}
