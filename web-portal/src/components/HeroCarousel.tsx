'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Play, Info } from 'lucide-react'

interface HeroSlide {
  id: string
  title: string
  description: string
  imageUrl?: string
  type: 'movie' | 'series' | 'live'
}

interface HeroCarouselProps {
  slides: HeroSlide[]
  autoPlayInterval?: number
  onPlayClick?: (id: string) => void
  onInfoClick?: (id: string) => void
}

export default function HeroCarousel({
  slides,
  autoPlayInterval = 5000,
  onPlayClick,
  onInfoClick,
}: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    if (slides.length <= 1 || isPaused) return

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length)
    }, autoPlayInterval)

    return () => clearInterval(interval)
  }, [slides.length, autoPlayInterval, isPaused])

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length)
  }

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % slides.length)
  }

  const goToSlide = (index: number) => {
    setCurrentIndex(index)
  }

  if (slides.length === 0) {
    return (
      <div className="relative w-full h-[500px] bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500">No content available</p>
      </div>
    )
  }

  const currentSlide = slides[currentIndex]
  const placeholderGradients = [
    'from-blue-600 via-purple-600 to-pink-600',
    'from-green-600 via-teal-600 to-blue-600',
    'from-orange-600 via-red-600 to-pink-600',
    'from-indigo-600 via-purple-600 to-pink-600',
  ]
  const gradientIndex = currentIndex % placeholderGradients.length

  return (
    <div
      className="relative w-full h-[500px] bg-black overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background Image/Gradient */}
      <div className="absolute inset-0">
        {currentSlide.imageUrl ? (
          <img
            src={currentSlide.imageUrl}
            alt={currentSlide.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${placeholderGradients[gradientIndex]}`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center">
        <div className="max-w-2xl space-y-4">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
            {currentSlide.title}
          </h1>
          
          {currentSlide.description && (
            <p className="text-base text-gray-300 line-clamp-3">
              {currentSlide.description}
            </p>
          )}

          <div className="flex items-center space-x-4 pt-4">
            <button
              onClick={() => onPlayClick?.(currentSlide.id)}
              className="flex items-center space-x-2 px-6 py-2.5 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors font-semibold text-sm"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Play Now</span>
            </button>

            <button
              onClick={() => onInfoClick?.(currentSlide.id)}
              className="flex items-center space-x-2 px-6 py-2.5 bg-gray-800/80 text-white rounded-lg hover:bg-gray-700 transition-colors font-semibold text-sm"
            >
              <Info className="w-4 h-4" />
              <span>More Info</span>
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Arrows */}
      {slides.length > 1 && (
        <>
          <button
            onClick={goToPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-black/50 hover:bg-black/70 rounded-full transition-colors"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>

          <button
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-black/50 hover:bg-black/70 rounded-full transition-colors"
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        </>
      )}

      {/* Indicators */}
      {slides.length > 1 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex space-x-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`h-1 rounded-full transition-all ${
                index === currentIndex
                  ? 'w-8 bg-white'
                  : 'w-6 bg-white/50 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
