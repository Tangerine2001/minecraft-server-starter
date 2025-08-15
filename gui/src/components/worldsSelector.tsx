'use client';

import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, RotateCcw, AlertCircle } from 'lucide-react';
import {useCallback, useEffect, useState} from "react";

export interface World {
    name: string;
}

type WorldsSelectorProps = {
    value?: World | null;
    onChange?: (world: World | null) => void;
    placeholder?: string;
    className?: string;   // forwarded to SelectTrigger
    disabled?: boolean;
};

export function WorldsSelector({
                                   value,
                                   onChange,
                                   placeholder = 'Select a world…',
                                   className,
                                   disabled,
                               }: WorldsSelectorProps) {
    const [worlds, setWorlds] = useState<World[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchWorlds = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/worlds', { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { worlds?: World[]; error?: string };
            if (!data.worlds) throw new Error(data.error || 'No worlds returned');

            const unique = Array.from(new Map(data.worlds.map(w => [w.name, w])).values());
            unique.sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
            );
            setWorlds(unique);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load worlds');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchWorlds();
    }, [fetchWorlds]);

    const selectedName = value?.name ?? undefined;
    const handleChange = (newName: string) => {
        const next = worlds.find(w => w.name === newName) ?? null;
        onChange?.(next);
    };

    const nothingToShow = !loading && !error && worlds.length === 0;

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <div className="w-40">
                    <Select value={selectedName} onValueChange={handleChange} disabled={disabled || loading || worlds.length === 0}>
                        <SelectTrigger className={`w-full ${className ?? ''}`}>
                            <SelectValue className="truncate" placeholder={loading ? 'Loading worlds…' : nothingToShow ? 'No worlds found' : placeholder} />
                        </SelectTrigger>

                        <SelectContent className="w-[--radix-select-trigger-width]">
                            {worlds.map((w) => (
                                <SelectItem key={w.name} value={w.name}>
                                    {w.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={fetchWorlds}
                    disabled={loading}
                    aria-label="Refresh worlds"
                >
                    {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <RotateCcw className="h-4 w-4" />
                    )}
                    <span className="sr-only">Refresh</span>
                </Button>
            </div>

            {error && (
                <div className="flex items-center text-sm text-red-600">
                    <AlertCircle className="mr-1 h-4 w-4" />
                    {error}
                </div>
            )}
        </div>
    );
}

export default WorldsSelector;
