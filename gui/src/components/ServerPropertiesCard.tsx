'use client';

import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useState } from 'react';
import { ServerProperties, Difficulty, isDifficulty } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';

type WhitelistEntry = { name: string; uuid?: string };

type Props = {
    worldName: string;
    currentServerProperties: ServerProperties | null;
    setCurrentServerProperties: Dispatch<SetStateAction<ServerProperties | null>>;
};

// ---- Difficulty options (matches your union) ----
const DIFFICULTY_OPTIONS = ['peaceful', 'easy', 'normal', 'hard'] as const;

// ---- Coercion helpers ----
const toBool = (v: unknown) => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'yes' || s === 'on';
    }
    return false;
};
const toInt = (v: unknown, fallback: number) => {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        return Number.isFinite(n) ? Math.trunc(n) : fallback;
    }
    return fallback;
};

export default function ServerPropertiesCard({
                                                 worldName,
                                                 currentServerProperties,
                                                 setCurrentServerProperties,
                                             }: Props) {
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Editable fields (subset commonly tweaked from UI)
    const [simulationDistance, setSimulationDistance] = useState<number>(10);
    const [viewDistance, setViewDistance] = useState<number>(10);
    const [difficulty, setDifficulty] = useState<Difficulty>('easy');
    const [pvp, setPvp] = useState<boolean>(true);
    const [whitelistEnabled, setWhitelistEnabled] = useState<boolean>(false);
    const [enforceWhitelist, setEnforceWhitelist] = useState<boolean>(false);

    // Whitelist
    const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
    const [wlName, setWlName] = useState('');
    const [wlUuid, setWlUuid] = useState('');

    // --- Load server.properties ---
    const fetchServerProperties = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/server-properties?world=${encodeURIComponent(worldName)}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: { serverProperties?: ServerProperties; error?: string } = await res.json();
            if (!data.serverProperties) throw new Error(data.error || 'No server properties returned');

            // Push into parent state
            setCurrentServerProperties(data.serverProperties);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load server.properties');
            setCurrentServerProperties(null);
        } finally {
            setIsLoading(false);
        }
    }, [worldName, setCurrentServerProperties]);

    // --- Load whitelist.json ---
    const fetchWhitelist = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch(`/api/whitelist?world=${encodeURIComponent(worldName)}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: { whitelist?: WhitelistEntry[]; error?: string } = await res.json();
            if (!data.whitelist) throw new Error(data.error || 'No whitelist returned');
            setWhitelist(data.whitelist);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load whitelist');
            setWhitelist([]);
        }
    }, [worldName]);

    // Initial load
    useEffect(() => {
        fetchServerProperties();
        fetchWhitelist();
    }, [fetchServerProperties, fetchWhitelist]);

    // Hydrate edit fields from parent state
    useEffect(() => {
        const sp = currentServerProperties;
        if (!sp) return;

        setSimulationDistance(toInt(sp['simulation-distance'], 10));
        setViewDistance(toInt(sp['view-distance'], 10));

        const diff = String(sp['difficulty'] ?? 'easy').toLowerCase();
        setDifficulty(isDifficulty(diff) ? diff : 'easy');

        setPvp(toBool(sp['pvp']));
        setWhitelistEnabled(toBool(sp['white-list']));
        setEnforceWhitelist(toBool(sp['enforce-whitelist']));
    }, [currentServerProperties]);

    const hasPropChanges = useMemo(() => {
        const sp = currentServerProperties;
        if (!sp) return false;
        const curDiff = isDifficulty(String(sp['difficulty'])) ? (sp['difficulty'] as Difficulty) : 'easy';

        return (
            toInt(sp['simulation-distance'], 10) !== simulationDistance ||
            toInt(sp['view-distance'], 10) !== viewDistance ||
            curDiff !== difficulty ||
            toBool(sp['pvp']) !== pvp ||
            toBool(sp['white-list']) !== whitelistEnabled ||
            toBool(sp['enforce-whitelist']) !== enforceWhitelist
        );
    }, [currentServerProperties, simulationDistance, viewDistance, difficulty, pvp, whitelistEnabled, enforceWhitelist]);

    const saveProps = useCallback(async () => {
        setIsSaving(true);
        setError(null);
        try {
            const patch: Partial<ServerProperties> = {
                'simulation-distance': simulationDistance,
                'view-distance': viewDistance,
                difficulty,
                pvp,
                'white-list': whitelistEnabled,
                'enforce-whitelist': enforceWhitelist,
            };

            const res = await fetch(`/api/server-properties?world=${encodeURIComponent(worldName)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            });
            if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`);

            // Refresh and keep parent in sync
            await fetchServerProperties();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save server.properties');
        } finally {
            setIsSaving(false);
        }
    }, [worldName, simulationDistance, viewDistance, difficulty, pvp, whitelistEnabled, enforceWhitelist, fetchServerProperties]);

    // Whitelist ops
    const addWhitelist = useCallback(() => {
        const name = wlName.trim();
        const uuid = wlUuid.trim();
        if (!name) return;
        setWhitelist((prev) => {
            if (prev.some((e) => e.name.toLowerCase() === name.toLowerCase())) return prev;
            return [...prev, uuid ? { name, uuid } : { name }];
        });
        setWlName('');
        setWlUuid('');
    }, [wlName, wlUuid]);

    const removeWhitelist = useCallback((name: string) => {
        setWhitelist((prev) => prev.filter((e) => e.name !== name));
    }, []);

    const saveWhitelist = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch(`/api/whitelist?world=${encodeURIComponent(worldName)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ whitelist }),
            });
            if (!res.ok) throw new Error(`Saving whitelist failed: HTTP ${res.status}`);
            await fetchWhitelist();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save whitelist');
        }
    }, [worldName, whitelist, fetchWhitelist]);

    return (
        <Card className="rounded-2xl">
            <CardHeader>
                <CardTitle>Server Settings</CardTitle>
                <CardDescription>
                    Adjust common options and manage the whitelist for <span className="font-medium">{worldName}</span>.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
                {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {error}
                    </div>
                )}

                {/* Basic settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Simulation Distance */}
                    <div className="space-y-2">
                        <Label htmlFor="simDist">Simulation Distance (chunks)</Label>
                        <Input
                            id="simDist"
                            type="number"
                            min={3}
                            max={32}
                            value={simulationDistance}
                            onChange={(e) => setSimulationDistance(toInt(e.target.value, simulationDistance))}
                        />
                        <p className="text-xs text-neutral-500">
                            How far entities/ticks simulate around players. Higher = more CPU.
                        </p>
                    </div>

                    {/* View Distance */}
                    <div className="space-y-2">
                        <Label htmlFor="viewDist">View Distance (chunks)</Label>
                        <Input
                            id="viewDist"
                            type="number"
                            min={2}
                            max={32}
                            value={viewDistance}
                            onChange={(e) => setViewDistance(toInt(e.target.value, viewDistance))}
                        />
                        <p className="text-xs text-neutral-500">
                            How far the server sends chunks to clients. Higher = more bandwidth/CPU.
                        </p>
                    </div>

                    {/* Difficulty */}
                    <div className="space-y-2">
                        <Label>Difficulty</Label>
                        <Select
                            value={difficulty}
                            onValueChange={(v) => {
                                if (isDifficulty(v)) setDifficulty(v);
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select difficulty" />
                            </SelectTrigger>
                            <SelectContent>
                                {DIFFICULTY_OPTIONS.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                        {opt[0].toUpperCase() + opt.slice(1)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* PvP */}
                    <div className="space-y-2">
                        <Label htmlFor="pvpSwitch">PvP</Label>
                        <div className="flex items-center gap-3">
                            <Switch id="pvpSwitch" checked={pvp} onCheckedChange={setPvp} />
                            <span className="text-sm text-neutral-700">Enable player‑vs‑player combat</span>
                        </div>
                    </div>
                </div>

                {/* Whitelist Settings */}
                <div className="space-y-4">
                    <div>
                        <h3 className="text-base font-semibold">Whitelist Settings</h3>
                        <p className="text-sm text-neutral-500">
                            Control who can join the server and how strictly the list is enforced.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="wlSwitch">Whitelist</Label>
                            <div className="flex items-center gap-3">
                                <Switch
                                    id="wlSwitch"
                                    checked={whitelistEnabled}
                                    onCheckedChange={setWhitelistEnabled}
                                />
                                <span className="text-sm text-neutral-700">
                  If enabled, only players on the whitelist can join.
                </span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="enforceWlSwitch">Enforce Whitelist</Label>
                            <div className="flex items-center gap-3">
                                <Switch
                                    id="enforceWlSwitch"
                                    checked={enforceWhitelist}
                                    onCheckedChange={setEnforceWhitelist}
                                />
                                <span className="text-sm text-neutral-700">
                  If enabled, removes non‑whitelisted players online and blocks new joins.
                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Save / Refresh */}
                <div className="flex items-center gap-3">
                    <Button onClick={saveProps} disabled={!hasPropChanges || isSaving || isLoading}>
                        {isSaving ? 'Saving…' : 'Save changes'}
                    </Button>
                    <Button variant="outline" onClick={fetchServerProperties} disabled={isLoading}>
                        {isLoading ? 'Refreshing…' : 'Refresh'}
                    </Button>
                    {hasPropChanges && <span className="text-xs text-neutral-500">Unsaved changes</span>}
                </div>

                <Separator />

                {/* Whitelist manager */}
                <div className="space-y-3">
                    <h3 className="text-base font-semibold">Whitelist Players</h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <Label htmlFor="wlName">Player name</Label>
                            <Input
                                id="wlName"
                                placeholder="Notch"
                                value={wlName}
                                onChange={(e) => setWlName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="wlUuid">UUID (optional)</Label>
                            <Input
                                id="wlUuid"
                                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                value={wlUuid}
                                onChange={(e) => setWlUuid(e.target.value)}
                            />
                        </div>
                        <div className="flex items-end">
                            <Button type="button" onClick={addWhitelist} className="w-full">
                                Add to whitelist
                            </Button>
                        </div>
                    </div>

                    {whitelist.length === 0 ? (
                        <p className="text-sm text-neutral-500">No players whitelisted yet.</p>
                    ) : (
                        <ul className="divide-y rounded-xl border">
                            {whitelist.map((entry) => (
                                <li key={`${entry.name}:${entry.uuid ?? ''}`} className="flex items-center justify-between p-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium">{entry.name}</p>
                                        {entry.uuid ? (
                                            <p className="text-xs text-neutral-500 truncate">{entry.uuid}</p>
                                        ) : (
                                            <p className="text-xs text-neutral-400">No UUID</p>
                                        )}
                                    </div>
                                    <Button variant="outline" onClick={() => removeWhitelist(entry.name)}>
                                        Remove
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="flex items-center gap-3">
                        <Button onClick={saveWhitelist}>Save whitelist</Button>
                        <Button variant="outline" onClick={fetchWhitelist}>Refresh</Button>
                    </div>

                    <p className="text-xs text-neutral-500">
                        Tip: If <code>online-mode</code> is true, providing correct UUIDs avoids name spoofing issues.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
