import { NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

type ServerProperties = Record<string, string>; // raw string values at the file boundary

// server.properties keys may escape ":" as "\:"
function unescapeKey(k: string): string {
    return k.replace(/\\:/g, ':').trim();
}
function escapeKey(k: string): string {
    return k.replace(/:/g, '\\:').trim();
}

function parseServerProperties(text: string): ServerProperties {
    const out: Record<string, string> = {};
    const lines = text.split(/\r?\n/);

    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;

        const eqIndex = line.indexOf('=');
        if (eqIndex === -1) continue;

        const rawKey = line.slice(0, eqIndex).trim();
        const value = line.slice(eqIndex + 1).trim();

        // Keep the original key semantics (no camelCase); just unescape "\:" → ":"
        const key = unescapeKey(rawKey);
        out[key] = value;
    }
    return out;
}

function stringifyServerProperties(props: Record<string, unknown>): string {
    // Note: this rewrites without comments and may reorder keys.
    // If you need comment preservation, we can do a line-based patch later.
    const lines: string[] = [];
    for (const [k, v] of Object.entries(props)) {
        const key = escapeKey(k);
        let str: string;
        if (typeof v === 'boolean') str = v ? 'true' : 'false';
        else if (typeof v === 'number') str = String(v);
        else str = String(v ?? '');
        lines.push(`${key}=${str}`);
    }
    return lines.join('\n');
}

function validateWorldName(world: string): boolean {
    return /^[A-Za-z0-9._-]+$/.test(world);
}

function getPaths(world: string) {
    const worldsPath = path.resolve(process.cwd(), '../worlds');
    const serverPropsPath = path.join(worldsPath, world, 'server.properties');
    return { worldsPath, serverPropsPath };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const world = searchParams.get('world');

        if (!world) {
            return NextResponse.json({ error: 'Missing required query parameter: world' }, { status: 400 });
        }
        if (!validateWorldName(world)) {
            return NextResponse.json({ error: 'Invalid world name' }, { status: 400 });
        }

        const { serverPropsPath } = getPaths(world);

        if (!fs.existsSync(serverPropsPath)) {
            return NextResponse.json(
                { error: `server.properties not found for world "${world}"` },
                { status: 404 }
            );
        }

        const content = await fsp.readFile(serverPropsPath, 'utf8');
        const serverProperties = parseServerProperties(content);

        // Keys remain raw: e.g. "simulation-distance", "view-distance", "white-list"
        return NextResponse.json({ world, serverProperties });
    } catch (error) {
        console.error('Error reading server.properties:', error);
        return NextResponse.json({ error: 'Failed to read server.properties' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const world = searchParams.get('world');

        if (!world) {
            return NextResponse.json({ error: 'Missing required query parameter: world' }, { status: 400 });
        }
        if (!validateWorldName(world)) {
            return NextResponse.json({ error: 'Invalid world name' }, { status: 400 });
        }

        const { serverPropsPath } = getPaths(world);

        if (!fs.existsSync(serverPropsPath)) {
            return NextResponse.json(
                { error: `server.properties not found for world "${world}"` },
                { status: 404 }
            );
        }

        // Body can be a partial patch of raw keys.
        // Example:
        // { "simulation-distance": 12, "view-distance": 10, "white-list": true }
        const patch = (await request.json()) as Record<string, unknown>;

        // Load current, merge, and write back
        const currentText = await fsp.readFile(serverPropsPath, 'utf8');
        const current = parseServerProperties(currentText);

        const merged: Record<string, unknown> = { ...current, ...patch };

        // Coerce a few common types if callers sent booleans/numbers
        // (server.properties expects strings; stringify handles canonicalization)
        const nextText = stringifyServerProperties(merged);

        await fsp.writeFile(serverPropsPath, nextText, 'utf8');
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Error updating server.properties:', error);
        return NextResponse.json({ error: 'Failed to update server.properties' }, { status: 500 });
    }
}
