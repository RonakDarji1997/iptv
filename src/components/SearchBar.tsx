'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
    onSearch: (query: string) => void;
    onQueryChange?: (query: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
    onClose?: () => void;
}

export function SearchBar({ onSearch, onQueryChange, placeholder = 'Search movies and series...', autoFocus = false, onClose }: SearchBarProps) {
    const [query, setQuery] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            onSearch(query.trim());
        }
    };

    const handleChange = (value: string) => {
        setQuery(value);
        // Trigger search on each character change if onQueryChange is provided
        if (onQueryChange) {
            onQueryChange(value);
        }
    };

    const handleClear = () => {
        setQuery('');
        if (onQueryChange) {
            onQueryChange('');
        } else {
            onSearch('');
        }
        if (onClose) {
            onClose();
        }
    };

    return (
        <form onSubmit={handleSubmit} className="relative w-full max-w-2xl">
            <div className={`relative flex items-center transition-all ${
                isFocused ? 'ring-2 ring-red-500' : ''
            } rounded-lg bg-zinc-900 border border-zinc-700`}>
                <Search className="absolute left-4 text-zinc-400" size={20} />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => handleChange(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    className="w-full pl-12 pr-12 py-3 bg-transparent text-white placeholder-zinc-500 focus:outline-none"
                />
                {query && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="absolute right-4 text-zinc-400 hover:text-white transition"
                    >
                        <X size={20} />
                    </button>
                )}
            </div>
        </form>
    );
}
