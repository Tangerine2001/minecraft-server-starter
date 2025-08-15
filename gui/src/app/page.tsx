'use client'

import { useEffect, useState, useCallback } from 'react';
import { World, ServerProperties } from '@/lib/types';
import WorldsSelector from '@/components/worldsSelector';
import ServerPropertiesCard from '@/components/ServerPropertiesCard';
import { Button } from '@/components/ui/button';

type StartResponse = {
    ok: boolean;
    worldName: string;
    pid: number;
    memory: string;
    jar: string;
    jarDir: string;
    requestedPort?: number;
    port?: number;
    portAutoPicked?: boolean;
};

export default function Home() {
    const [selectedWorld, setSelectedWorld] = useState<World | null>(null);
    const [currentServerProperties, setCurrentServerProperties] = useState<ServerProperties | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [statusLoading, setStatusLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [portInfo, setPortInfo] = useState<{ requestedPort: number; port: number; autoPicked: boolean } | null>(null);

    const fetchServerStatus = useCallback(async (worldName: string) => {
        setStatusLoading(true);
        try {
            const res = await fetch(`/api/server/status?worldName=${encodeURIComponent(worldName)}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(await res.text());
            const data: { running?: boolean } = await res.json();
            setIsRunning(Boolean(data.running));
        } catch {
            setIsRunning(false);
        } finally {
            setStatusLoading(false);
        }
    }, []);

    useEffect(() => {
        if (selectedWorld) {
            fetchServerStatus(selectedWorld.name);
        } else {
            setIsRunning(false);
        }
    }, [selectedWorld, fetchServerStatus]);

    const startServer = async () => {
        if (!selectedWorld) return;
        setBusy(true);
        setStatus(null);
        setPortInfo(null);
        try {
            const res = await fetch('/api/server/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    worldName: selectedWorld.name,
                    memory: currentServerProperties?.memory || '4G',
                }),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'failed to start');
            }

            const data: StartResponse = await res.json();
            setIsRunning(true);

            if (typeof data.port === 'number' && typeof data.requestedPort === 'number') {
                if (data.portAutoPicked) {
                    setStatus(`Requested port ${data.requestedPort} was busy; running on ${data.port} instead.`);
                } else {
                    setStatus(`Started on port ${data.port}.`);
                }
                setPortInfo({
                    requestedPort: data.requestedPort,
                    port: data.port,
                    autoPicked: Boolean(data.portAutoPicked),
                });
            } else {
                setStatus(`Started ${selectedWorld.name}`);
            }
        } catch (e) {
            setStatus(`Error: ${e instanceof Error ? e.message : 'failed to start'}`);
        } finally {
            setBusy(false);
            if (selectedWorld) fetchServerStatus(selectedWorld.name);
        }
    };

    const stopServer = async () => {
        if (!selectedWorld) return;
        setBusy(true);
        setStatus(null);
        try {
            const res = await fetch('/api/server/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ worldName: selectedWorld.name }),
            });
            if (!res.ok) throw new Error(await res.text());
            setIsRunning(false);
            setPortInfo(null);
            setStatus(`Stopped ${selectedWorld.name}`);
        } catch (e) {
            setStatus(`Error: ${e instanceof Error ? e.message : 'failed to stop'}`);
        } finally {
            setBusy(false);
            if (selectedWorld) fetchServerStatus(selectedWorld.name);
        }
    };

    return (
        <div className="font-sans grid grid-rows-[auto_1fr] items-start justify-items-stretch min-h-screen p-8 gap-8 sm:p-12">
            <div className="max-w-3xl w-full mx-auto">
                <WorldsSelector placeholder="Select a world..." onChange={setSelectedWorld} />
                {selectedWorld ? (
                    <p className="mt-2 text-sm text-neutral-500">
                        Selected: <span className="font-medium">{selectedWorld.name}</span>
                    </p>
                ) : null}
            </div>

            {selectedWorld && (
                <div className="max-w-3xl w-full mx-auto space-y-4">
                    <ServerPropertiesCard
                        worldName={selectedWorld.name}
                        currentServerProperties={currentServerProperties}
                        setCurrentServerProperties={setCurrentServerProperties}
                    />

                    <div className="flex items-center gap-3">
                        {statusLoading ? (
                            <Button disabled>Checking status…</Button>
                        ) : isRunning ? (
                            <Button variant="destructive" onClick={stopServer} disabled={busy}>
                                {busy ? 'Stopping…' : 'Stop Server'}
                            </Button>
                        ) : (
                            <Button onClick={startServer} disabled={busy}>
                                {busy ? 'Starting…' : 'Start Server'}
                            </Button>
                        )}
                        {status && <span className="text-sm text-neutral-600">{status}</span>}
                    </div>

                    {portInfo && (
                        <p className="text-xs text-neutral-500">
                            Requested: {portInfo.requestedPort} · Actual: {portInfo.port}
                            {portInfo.autoPicked ? ' (auto-picked)' : ''}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
