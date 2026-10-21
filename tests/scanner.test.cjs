const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const {
  elapsed,
  parseProcesses,
  parseListeners,
  classify,
  scan,
} = require("../dist-electron/scanner.js");
test("parses elapsed time in minute, hour, and day formats", () => {
  assert.equal(elapsed("03:20"), 200);
  assert.equal(elapsed("02:03:20"), 7400);
  assert.equal(elapsed("2-02:03:20"), 180200);
});
test("deduplicates IPv4 and IPv6 listeners while retaining multiple ports", () => {
  const result = parseListeners(
    "p123\ncnode\nn127.0.0.1:3000\nn[::1]:3000\nn*:3001\np456\ncpython\nn*:8000\n",
  );
  assert.deepEqual(result.get(123).ports, [3000, 3001]);
  assert.equal(result.get(123).addresses.length, 3);
  assert.deepEqual(result.get(456).ports, [8000]);
});
test("parses process identity with padded start dates and command spaces", () => {
  const p = parseProcesses(
    " 123 1 501 2.5 102400 2-01:02:03 Wed Oct  7 09:10:11 2026 /usr/local/bin/node /a project/server.js\n",
  ).get(123);
  assert.equal(p.startedAt, "Wed Oct 7 09:10:11 2026");
  assert.equal(p.command, "/usr/local/bin/node /a project/server.js");
  assert.equal(p.memory, 104857600);
  assert.equal(p.uptime, 176523);
});
test("classifies development runtimes and keeps app or agent services read-only", () => {
  assert.equal(
    classify("node /project/node_modules/vite/bin/vite.js", "node").runtime,
    "Vite",
  );
  assert.equal(classify("next-server (v15.0.0)", "node").runtime, "Next.js");
  assert.equal(
    classify("python -m uvicorn main:app", "python").runtime,
    "FastAPI",
  );
  for (const cmd of [
    "/Applications/Editor.app/node vite",
    "node mcp-server/index.js",
    "/usr/libexec/ControlCenter",
    "com.docker.backend",
    "/Applications/Codex.app/node",
  ])
    assert.equal(classify(cmd, "server").development, false, cmd);
});
test(
  "real macOS scan finds a disposable TCP server and protects own process tree",
  { skip: process.platform !== "darwin", timeout: 20000 },
  async () => {
    const child = spawn(
      process.execPath,
      [
        "-e",
        "require('net').createServer().listen(0, '127.0.0.1', function(){ console.log(this.address().port) })",
      ],
      { cwd: "/private/tmp", stdio: ["ignore", "pipe", "pipe"] },
    );
    try {
      const [chunk] = await Promise.race([
        once(child.stdout, "data"),
        once(child, "exit").then(([code]) => {
          throw new Error(`TCP fixture exited before listening (code ${code})`);
        }),
      ]);
      const port = Number(String(chunk).trim());
      const services = await scan();
      const found = services.find((s) => s.pid === child.pid);
      assert.ok(found, "fixture listener discovered");
      assert.ok(found.ports.includes(port));
      assert.equal(found.protected, true, "descendant cannot be stopped");
      assert.equal(found.canStop, false);
      assert.ok(found.startedAt);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        await once(child, "exit");
      }
    }
  },
);

test("stop revalidation rejects a reused PID, changed command, exited or protected process", () => {
  const { isSameStoppableService } = require("../dist-electron/scanner.js");
  const expected = {
    id: "123:start-a",
    pid: 123,
    startedAt: "start-a",
    command: "node server.js",
    canStop: true,
  };
  assert.equal(isSameStoppableService(expected, { ...expected }), true);
  for (const current of [
    undefined,
    { ...expected, id: "123:start-b", startedAt: "start-b" },
    { ...expected, command: "node other.js" },
    { ...expected, canStop: false },
  ]) {
    assert.equal(isSameStoppableService(expected, current), false);
  }
});
