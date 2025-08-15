import { NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

type WhitelistEntry = { name: string; uuid?: string };

function validateWorldName(world: string): boolean {
    return /^[A-Za-z0-9._-]+$/.test(world);
}

function getPaths(world: string) {
    const worldsPath = path.resolve(process.cwd(), '../worlds');
    const whitelistPath = path.join(worldsPath, world, 'whitelist.json');
    return { whitelistPath };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const world = searchParams.get('world');
        if (!world) return NextResponse.json({ error: 'Missing world' }, { status: 400 });
        if (!validateWorldName(world)) return NextResponse.json({ error: 'Invalid world' }, { status: 400 });

        const { whitelistPath } = getPaths(world);
        if (!fs.existsSync(whitelistPath)) {
            // treat missing file as empty whitelist
            return NextResponse.json({ whitelist: [] });
        }
        const text = await fsp.readFile(whitelistPath, 'utf8');
        const arr = JSON.parse(text) as unknown;
        if (!Array.isArray(arr)) return NextResponse.json({ error: 'Invalid whitelist.json' }, { status: 500 });
        // Light sanitize: name required
        const wl = arr
            .filter((e: any) => e && typeof e.name === 'string')
            .map((e: any) => ({ name: e.name, uuid: typeof e.uuid === 'string' ? e.uuid : undefined })) as WhitelistEntry[];

        return NextResponse.json({ whitelist: wl });
    } catch (e) {
        console.error('Whitelist GET error:', e);
        return NextResponse.json({ error: 'Failed to read whitelist' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const world = searchParams.get('world');
        if (!world) return NextResponse.json({ error: 'Missing world' }, { status: 400 });
        if (!validateWorldName(world)) return NextResponse.json({ error: 'Invalid world' }, { status: 400 });

        const body = (await request.json()) as { whitelist?: WhitelistEntry[] };
        const list = Array.isArray(body.whitelist) ? body.whitelist : [];
        const sanitized = list
            .filter((e) => e && typeof e.name === 'string' && e.name.trim() !== '')
            .map((e) => ({ name: e.name.trim(), ...(e.uuid ? { uuid: e.uuid.trim() } : {}) }));

        const { whitelistPath } = getPaths(world);
        await fsp.writeFile(whitelistPath, JSON.stringify(sanitized, null, 2), 'utf8');

        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error('Whitelist PUT error:', e);
        return NextResponse.json({ error: 'Failed to write whitelist' }, { status: 500 });
    }
}
