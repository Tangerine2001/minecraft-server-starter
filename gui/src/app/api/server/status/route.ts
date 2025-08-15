import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Ensure Node runtime so process.kill is available
export const runtime = 'nodejs';

// Match the same directory layout as /api/server/start
const GUI_DIR = process.cwd();
const ROOT_DIR = path.resolve(GUI_DIR, '..');          // repo root where worlds/ lives
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

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const worldName = (searchParams.get('worldName') || '').trim();
    if (!worldName) {
        return new NextResponse('worldName is required', { status: 400 });
    }

    try {
        const txt = await fs.readFile(pidFile(worldName), 'utf8');
        const pid = Number.parseInt(txt, 10);
        const running = isAlive(pid);
        return NextResponse.json({ running, pid: running ? pid : null });
    } catch {
        // No PID file or unreadable -> not running
        return NextResponse.json({ running: false, pid: null });
    }
}
