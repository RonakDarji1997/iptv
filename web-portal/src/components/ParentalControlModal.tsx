'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '@/services/authService';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface ParentalControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ParentalControlModal({
  isOpen,
  onClose,
  onSuccess
}: ParentalControlModalProps) {
  const [pin, setPin] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setPin(['', '', '', '']);
      setError('');
      setAttempts(0);
    }
  }, [isOpen]);

  const handlePinChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only allow digits

    const newPin = [...pin];
    newPin[index] = value.slice(-1); // Take only last character
    setPin(newPin);
    setError('');

    // Auto-focus next input
    if (value && index < 3) {
      const nextInput = document.getElementById(`pin-${index + 1}`);
      nextInput?.focus();
    }

    // Auto-submit when all 4 digits entered
    if (newPin.every(d => d !== '') && index === 3) {
      verifyPin(newPin.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      const prevInput = document.getElementById(`pin-${index - 1}`);
      prevInput?.focus();
    }
  };

  const verifyPin = async (pinValue: string) => {
    if (attempts >= 3) {
      setError('Too many attempts. Please try again later.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/parental-control/verify`, {
        method: 'POST',
        headers: {
          ...authService.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin: pinValue }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Store session token
        sessionStorage.setItem('parental_session', data.sessionToken);
        sessionStorage.setItem('parental_expires', (Date.now() + data.expiresIn * 1000).toString());
        
        toast.success('Access granted');
        onSuccess();
      } else {
        setAttempts(prev => prev + 1);
        setError(data.error || 'Incorrect PIN');
        setPin(['', '', '', '']);
        document.getElementById('pin-0')?.focus();
      }
    } catch (error) {
      console.error('Error verifying PIN:', error);
      setError('Failed to verify PIN');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pinValue = pin.join('');
    if (pinValue.length === 4) {
      verifyPin(pinValue);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-md w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
        >
          <X size={24} />
        </button>

        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Parental Control</h2>
          <p className="text-gray-400">Enter your 4-digit PIN to access this content</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="flex justify-center gap-3 mb-6">
            {pin.map((digit, index) => (
              <input
                key={index}
                id={`pin-${index}`}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handlePinChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                disabled={loading || attempts >= 3}
                className="w-14 h-14 text-center text-2xl font-bold bg-gray-800 border-2 border-gray-700 rounded-lg text-white focus:border-yellow-500 focus:outline-none disabled:opacity-50"
                autoFocus={index === 0}
              />
            ))}
          </div>

          {error && (
            <div className="text-red-500 text-center mb-4 text-sm">
              {error}
              {attempts > 0 && attempts < 3 && ` (${3 - attempts} attempts remaining)`}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pin.some(d => d === '') || loading || attempts >= 3}
              className="flex-1 px-4 py-3 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-black disabled:text-gray-500 rounded-lg font-medium transition-colors"
            >
              {loading ? 'Verifying...' : 'Unlock'}
            </button>
          </div>
        </form>

        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            Session will expire after 1 hour
          </p>
        </div>
      </div>
    </div>
  );
}
