import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Ensure Node runtime for process.kill
export const runtime = 'nodejs';

// Match /api/server/start and /api/server/status
const GUI_DIR = process.cwd();
const ROOT_DIR = path.resolve(GUI_DIR, '..');      // repo root
const PID_DIR  = path.join(ROOT_DIR, '.mc-pids');

function pidFile(worldName: string) {
    return path.join(PID_DIR, `${worldName}.pid`);
}

function isAlive(pid: number): boolean {
    try {
        if (!Number.isInteger(pid) || pid <= 0) return false;
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

export async function POST(req: Request) {
    const { worldName = '' } = (await req.json()) as { worldName?: string };
    const name = worldName.trim();
    if (!name) {
        return new NextResponse('worldName is required', { status: 400 });
    }

    const pfile = pidFile(name);

    // If there's no pid file, treat as already stopped (idempotent)
    let pidText: string | null = null;
    try {
        pidText = await fs.readFile(pfile, 'utf8');
    } catch {
        return NextResponse.json({
            ok: true,
            alreadyStopped: true,
            message: 'No running server found (no PID file).',
        });
    }

    const pid = Number.parseInt(pidText, 10);

    // If PID isn’t alive, clean up the pidfile and return alreadyStopped
    if (!isAlive(pid)) {
        try { await fs.unlink(pfile); } catch { /* ignore */ }
        return NextResponse.json({
            ok: true,
            alreadyStopped: true,
            message: 'No running server found (stale PID cleaned).',
        });
    }

    // Try to terminate gracefully; fall back to SIGKILL if needed
    try {
        process.kill(pid, 'SIGTERM');
    } catch (e) {
        // If TERM failed because it’s gone, treat as stopped
        try { await fs.unlink(pfile); } catch { /* ignore */ }
        return NextResponse.json({
            ok: true,
            alreadyStopped: true,
            message: 'Process already exited.',
        });
    }

    // Best-effort pidfile cleanup; the detached process will exit
    try { await fs.unlink(pfile); } catch { /* ignore */ }

    return NextResponse.json({
        ok: true,
        stopped: true,
        pid,
    });
}
