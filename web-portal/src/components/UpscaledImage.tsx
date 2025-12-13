'use client';

import { useEffect, useRef, useState } from 'react';

interface UpscaledImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  scale?: number;
}

export function UpscaledImage({ src, alt, className = '', style = {}, scale = 2 }: UpscaledImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !src) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    // Try without crossOrigin first for same-origin images
    
    img.onload = () => {
      try {
        // Set canvas size to scaled dimensions
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        // Disable image smoothing for sharper upscaling
        ctx.imageSmoothingEnabled = false;

        // Draw image at scaled size
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Apply sharpening filter
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const sharpened = applySharpen(imageData);
        ctx.putImageData(sharpened, 0, 0);

        setIsLoading(false);
      } catch (err) {
        // Canvas operations failed (likely CORS), use fallback
        console.warn('Canvas upscaling failed, using fallback:', err);
        setUseFallback(true);
        setIsLoading(false);
      }
    };

    img.onerror = () => {
      setUseFallback(true);
      setIsLoading(false);
    };

    img.src = src;
  }, [src, scale]);

  // Simple sharpening kernel
  const applySharpen = (imageData: ImageData): ImageData => {
    const pixels = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const output = new ImageData(width, height);
    const outputPixels = output.data;

    // Sharpening kernel
    const kernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) { // RGB channels
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const pixelIndex = ((y + ky) * width + (x + kx)) * 4 + c;
              const kernelIndex = (ky + 1) * 3 + (kx + 1);
              sum += pixels[pixelIndex] * kernel[kernelIndex];
            }
          }
          const outputIndex = (y * width + x) * 4 + c;
          outputPixels[outputIndex] = Math.max(0, Math.min(255, sum));
        }
        // Copy alpha channel
        const alphaIndex = (y * width + x) * 4 + 3;
        outputPixels[alphaIndex] = pixels[alphaIndex];
      }
    }

    return output;
  };

  // Use regular img tag as fallback
  if (useFallback) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        style={{ 
          imageRendering: 'crisp-edges',
          filter: 'contrast(1.1) saturate(1.1) sharpen(1)',
          ...style 
        }}
      />
    );
  }

  return (
    <div className={`relative ${className}`} style={style}>
      {isLoading && (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 animate-pulse" />
      )}
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        style={{ imageRendering: 'auto', ...style }}
      />
    </div>
  );
}
