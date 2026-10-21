import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { Service } from "./types";
const exec = promisify(execFile);
export const run = async (file: string, args: string[]) =>
  (
    await exec(file, args, {
      timeout: 10000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, LC_ALL: "C" },
    })
  ).stdout;
export function elapsed(value: string): number {
  const [days, clock] = value.includes("-") ? value.split("-") : ["0", value];
  const parts = clock.split(":").map(Number);
  return Number(days) * 86400 + parts.reduce((sum, n) => sum * 60 + n, 0);
}
export interface ProcessInfo {
  pid: number;
  ppid: number;
  uid: number;
  cpu: number;
  memory: number;
  uptime: number;
  startedAt: string;
  command: string;
}
export function parseProcesses(output: string): Map<number, ProcessInfo> {
  const result = new Map<number, ProcessInfo>();
  for (const line of output.split("\n")) {
    const m = line
      .trim()
      .match(
        /^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(.+)$/,
      );
    if (m)
      result.set(+m[1], {
        pid: +m[1],
        ppid: +m[2],
        uid: +m[3],
        cpu: +m[4],
        memory: +m[5] * 1024,
        uptime: elapsed(m[6]),
        startedAt: m[7].replace(/\s+/g, " "),
        command: m[8],
      });
  }
  return result;
}
export function parseListeners(
  output: string,
): Map<number, { ports: number[]; addresses: string[]; name: string }> {
  const results = new Map<
    number,
    { ports: number[]; addresses: string[]; name: string }
  >();
  let pid = 0;
  for (const line of output.split("\n")) {
    if (line.startsWith("p")) {
      pid = Number(line.slice(1));
      if (!results.has(pid))
        results.set(pid, { ports: [], addresses: [], name: "" });
    }
    const item = results.get(pid);
    if (!item) continue;
    if (line.startsWith("c")) item.name = line.slice(1);
    if (line.startsWith("n")) {
      const match = line.match(/:(\d+)$/);
      if (match && +match[1] > 0 && +match[1] <= 65535) {
        if (!item.ports.includes(+match[1])) item.ports.push(+match[1]);
        if (!item.addresses.includes(line.slice(1)))
          item.addresses.push(line.slice(1));
      }
    }
  }
  return results;
}
export function classify(
  command: string,
  name: string,
): { runtime: string; development: boolean } {
  const text = `${name} ${command}`.toLowerCase();
  if (/\.app\/|electron|language-server|mcp[-_/ ]|codex|copilot/.test(text))
    return { runtime: name || "Process", development: false };
  if (/vite(?:\/|\s|$)/.test(text))
    return { runtime: "Vite", development: true };
  if (/next(?:-server|\/|\s)/.test(text))
    return { runtime: "Next.js", development: true };
  if (/nuxt/.test(text)) return { runtime: "Nuxt", development: true };
  if (/uvicorn|fastapi/.test(text))
    return { runtime: "FastAPI", development: true };
  if (/gunicorn|django/.test(text))
    return { runtime: "Python", development: true };
  if (
    /node|bun(?:\s|\/|$)|deno/.test(text) &&
    !/\.app\/|electron|language-server|mcp[-_/ ]|codex|copilot|typescript-language/.test(
      text,
    )
  )
    return {
      runtime: /bun/.test(text)
        ? "Bun"
        : /deno/.test(text)
          ? "Deno"
          : "Node.js",
      development: true,
    };
  if (
    /python|ruby|rails|puma|php|java|cargo|\/go(?:\s|\/)|\/tmp\/go-build/.test(
      text,
    ) &&
    !/\.app\/|language.server|mcp[-_/ ]|codex/.test(text)
  )
    return {
      runtime: /python/.test(text)
        ? "Python"
        : /ruby|rails|puma/.test(text)
          ? "Ruby"
          : /php/.test(text)
            ? "PHP"
            : /java/.test(text)
              ? "Java"
              : "Server",
      development: true,
    };
  return { runtime: name || "Process", development: false };
}
export async function processes() {
  return parseProcesses(
    await run("/bin/ps", [
      "-axo",
      "pid=,ppid=,uid=,pcpu=,rss=,etime=,lstart=,command=",
    ]),
  );
}
export async function scan(): Promise<Service[]> {
  if (process.platform !== "darwin")
    throw new Error("目前僅支援 macOS 的程序掃描。");
  let listeners = "";
  try {
    listeners = await run("/usr/sbin/lsof", [
      "-nP",
      "-a",
      "-u",
      String(process.getuid!()),
      "-iTCP",
      "-sTCP:LISTEN",
      "-Fpcn",
    ]);
  } catch (error) {
    if ((error as { code?: number }).code !== 1) throw error;
  }
  const sockets = parseListeners(listeners);
  const procs = await processes();
  // Protect DevDock, its child processes and its ancestors, including the development server.
  const protectedIds = new Set<number>([process.pid]);
  const ownChildren = new Set<number>([process.pid]);
  let parent = procs.get(process.pid)?.ppid;
  while (parent && parent > 1 && !protectedIds.has(parent)) {
    protectedIds.add(parent);
    parent = procs.get(parent)?.ppid;
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const p of procs.values())
      if (ownChildren.has(p.ppid) && !ownChildren.has(p.pid)) {
        ownChildren.add(p.pid);
        protectedIds.add(p.pid);
        changed = true;
      }
  }
  const pids = [...sockets.keys()].filter((pid) => procs.has(pid));
  const directories = new Map<number, string>();
  if (pids.length) {
    try {
      const output = await run("/usr/sbin/lsof", [
        "-a",
        "-p",
        pids.join(","),
        "-d",
        "cwd",
        "-Fpn",
      ]);
      let pid = 0;
      for (const line of output.split("\n")) {
        if (line[0] === "p") pid = +line.slice(1);
        if (line[0] === "n") directories.set(pid, line.slice(1));
      }
    } catch {
      /* A process may exit between scans; keep its directory unavailable. */
    }
  }
  return pids
    .flatMap((pid) => {
      const p = procs.get(pid)!,
        socket = sockets.get(pid)!;
      if (!socket.ports.length) return [];
      const cwd = directories.get(pid) || "";
      const kind = classify(p.command, socket.name);
      const protectedProcess =
        protectedIds.has(pid) ||
        cwd === path.resolve(__dirname, "..") ||
        /DevDock\.app\/|devdock\/node_modules\/electron\//i.test(p.command);
      return [
        {
          id: `${pid}:${p.startedAt}`,
          pid,
          name: cwd && cwd !== "/" ? path.basename(cwd) : socket.name,
          ...kind,
          command: p.command,
          cwd,
          ports: socket.ports.sort((a, b) => a - b),
          addresses: socket.addresses,
          cpu: p.cpu,
          memory: p.memory,
          uptime: p.uptime,
          startedAt: p.startedAt,
          protected: protectedProcess,
          canStop:
            p.uid === process.getuid!() &&
            kind.development &&
            !protectedProcess,
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(b.development) - Number(a.development) ||
        a.ports[0] - b.ports[0],
    );
}

/** Require both the original process identity and current permission after confirmation. */
export function isSameStoppableService(
  expected: Service,
  current: Service | undefined,
): boolean {
  return (
    !!current &&
    current.canStop &&
    expected.canStop &&
    current.id === expected.id &&
    current.pid === expected.pid &&
    current.startedAt === expected.startedAt &&
    current.command === expected.command
  );
}
