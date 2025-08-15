import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import net, { AddressInfo } from 'net';

// Mojang manifest and version types
interface MojangManifestVersion {
    id: string;
    url: string;
}

interface MojangManifest {
    latest: { release?: string };
    versions: MojangManifestVersion[];
}

interface MojangVersionJson {
    downloads?: {
        server?: { url?: string };
    };
}

// Paths: repo root is one level up from gui/
const GUI_DIR = process.cwd();
const ROOT_DIR = path.resolve(GUI_DIR, '..');          // repo root where worlds/ lives
const PUBLIC_DIR = path.join(GUI_DIR, 'public');       // gui/public
const PID_DIR = path.join(ROOT_DIR, '.mc-pids');
const WORLDS_DIR = path.join(ROOT_DIR, 'worlds');

async function ensureDir(p: string) {
    await fs.mkdir(p, { recursive: true });
}
function pidFile(worldName: string) {
    return path.join(PID_DIR, `${worldName}.pid`);
}
async function isAlive(pid: number) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

// Prefer files named server*.jar, else any *.jar; pick newest by mtime
async function findExistingJar(dir: string): Promise<string | null> {
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const jars = entries
            .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.jar'))
            .map(e => e.name);
        if (!jars.length) return null;
        const preferred = jars.filter(n => /^server.*\.jar$/i.test(n));
        const list = preferred.length ? preferred : jars;
        const stats = await Promise.all(
            list.map(async n => ({
                n,
                t: (await fs.stat(path.join(dir, n))).mtimeMs,
            }))
        );
        stats.sort((a, b) => b.t - a.t);
        return path.join(dir, stats[0].n);
    } catch {
        return null;
    }
}

// Download latest release server jar (official Mojang endpoints)
async function downloadLatestServerJar(
    targetDir: string
): Promise<{ jarPath: string; version: string }> {
    const manifestUrl =
        'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
    const manifestRes = await fetch(manifestUrl, { cache: 'no-store' });
    if (!manifestRes.ok)
        throw new Error(`Failed version manifest: ${manifestRes.status}`);
    const manifest: MojangManifest = await manifestRes.json();

    const latestId: string | undefined = manifest?.latest?.release;
    if (!latestId) throw new Error('No latest release in manifest');

    const entry = manifest.versions.find(v => v.id === latestId);
    if (!entry?.url)
        throw new Error(`No version URL for ${latestId}`);

    const versionRes = await fetch(entry.url, { cache: 'no-store' });
    if (!versionRes.ok)
        throw new Error(`Failed version JSON: ${versionRes.status}`);
    const versionJson: MojangVersionJson = await versionRes.json();

    const serverUrl: string | undefined = versionJson?.downloads?.server?.url;
    if (!serverUrl)
        throw new Error('No server download URL in version JSON');

    const jarName = `server-${latestId}.jar`;
    const dest = path.join(targetDir, jarName);

    const jarRes = await fetch(serverUrl, { cache: 'no-store' });
    if (!jarRes.ok)
        throw new Error(`Failed to download server jar: ${jarRes.status}`);
    const buf = Buffer.from(await jarRes.arrayBuffer());

    await ensureDir(targetDir);
    await fs.writeFile(dest, buf);

    return { jarPath: dest, version: latestId };
}

function resolveJarDir(jarDir: string | undefined): string {
    if (!jarDir || jarDir === 'root') return ROOT_DIR;
    if (jarDir === 'public') return PUBLIC_DIR;

    // Limit: only allow subfolders under ROOT_DIR or GUI_DIR to avoid path traversal
    const candidate = path.isAbsolute(jarDir)
        ? jarDir
        : path.join(ROOT_DIR, jarDir);
    return candidate;
}

function checkPortAvailable(port: number, host = '0.0.0.0'): Promise<boolean> {
    return new Promise((resolve) => {
        const srv = net.createServer()
            .once('error', () => resolve(false))
            .once('listening', () => srv.close(() => resolve(true)));
        // exclusive=true avoids portsharing oddities on some platforms
        srv.listen({ port, host, exclusive: true });
    });
}

function getEphemeralPort(host = '0.0.0.0'): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.once('listening', () => {
            const addr = srv.address();
            const chosen = typeof addr === 'object' && addr !== null ? (addr as AddressInfo).port : 0;
            srv.close(() => resolve(chosen));
        });
        srv.once('error', (err: unknown) => reject(err));
        srv.listen({ port: 0, host, exclusive: true });
    });
}

/** Try preferred; if taken, return an ephemeral free port. */
async function findAvailablePort(preferred: number): Promise<{ port: number; autoPicked: boolean }> {
    const ok = await checkPortAvailable(preferred);
    if (ok) return { port: preferred, autoPicked: false };
    const ephem = await getEphemeralPort();
    return { port: ephem, autoPicked: true };
}


type Body = {
    worldName?: string;
    memory?: string;
    serverJar?: string;
    jarDir?: 'root' | 'public' | string;
    port?: number; // defaults to 25565
};

export async function POST(req: Request) {
    const {
        worldName = '',
        memory = '4G',
        serverJar = '',
        jarDir,
        port: requestedPort = 25565,
    }: Body = await req.json();

    const name = worldName.trim();
    if (!name) {
        return new NextResponse('worldName is required', { status: 400 });
    }

    // Validate port input first (1–65535)
    if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
        return new NextResponse('Invalid port number. Must be between 1 and 65535.', { status: 400 });
    }

    await ensureDir(PID_DIR);

    // Bail if already running
    try {
        const existing = Number.parseInt(await fs.readFile(pidFile(name), 'utf8'), 10);
        if (existing && (await isAlive(existing))) {
            return new NextResponse('Server already running for this world.', { status: 409 });
        }
    } catch { /* ignore */ }

    // Ensure world directory
    const worldPath = path.join(WORLDS_DIR, name);
    await ensureDir(worldPath);

    // Resolve server jar
    const targetJarDir = resolveJarDir(jarDir);
    let jarPath: string | null = null;
    if (serverJar) {
        jarPath = path.isAbsolute(serverJar) ? serverJar : path.join(ROOT_DIR, serverJar);
    } else {
        jarPath = await findExistingJar(targetJarDir);
        if (!jarPath) {
            const result = await downloadLatestServerJar(targetJarDir);
            jarPath = result.jarPath;
        }
    }

    // Pick a usable port (stick to requested if it's free)
    let chosenPort: number;
    let autoPicked = false;
    try {
        const res = await findAvailablePort(requestedPort);
        chosenPort = res.port;
        autoPicked = res.autoPicked;
    } catch (err) {
        return new NextResponse('Unable to allocate a free port.', { status: 503 });
    }

    // Launch
    const args = [
        `-Xmx${memory}`,
        `-Xms${memory}`,
        '-jar',
        jarPath,
        'nogui',
        '--world', worldPath,
        '--port', String(chosenPort),
    ];

    try {
        const child = spawn('java', args, {
            cwd: ROOT_DIR,
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            shell: false,
        });

        await fs.writeFile(pidFile(name), String(child.pid));
        child.unref();

        return NextResponse.json({
            ok: true,
            worldName: name,
            pid: child.pid,
            memory,
            jar: jarPath,
            jarDir: targetJarDir,
            requestedPort,
            port: chosenPort,
            portAutoPicked: autoPicked, // true if requested was in use
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'spawn failed';
        return new NextResponse(`Error: ${msg}`, { status: 500 });
    }
}
