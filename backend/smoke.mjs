// Usage: npm run smoke [-- <base URL>]. Without a URL it starts the built
// dist/main.js on a free port and stops it again, whatever the result.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";

let base = process.argv[2];
let server;
const responses = [];
const logLines = [];

async function request(path, init) {
  const response = await fetch(new URL(path, base), {
    ...init,
    signal: AbortSignal.timeout(5000),
  });
  responses.push(response);
  return {
    status: response.status,
    type: response.headers.get("content-type"),
    text: await response.text(),
  };
}

function post(body) {
  return request("/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function check(name, test) {
  const passed = await test().catch(() => false);
  if (!passed) throw new Error(name);
}

async function waitFor(condition, ms) {
  const deadline = Date.now() + ms;
  while (!(await condition().catch(() => false))) {
    if (Date.now() > deadline) return false;
    await sleep(100);
  }
  return true;
}

async function startServer() {
  const probe = createServer().listen(0);
  await once(probe, "listening");
  const { port } = probe.address();
  probe.close();
  server = spawn(process.execPath, ["dist/main.js"], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "inherit"],
  });
  createInterface({ input: server.stdout }).on("line", (line) =>
    logLines.push(line),
  );
  return `http://localhost:${port}`;
}

function httpLogLines() {
  return logLines
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.context === "HTTP");
}

try {
  if (!base) base = await startServer();
  await check("the server answers /health within 10 seconds", () =>
    waitFor(() => request("/health"), 10_000),
  );
  await check(
    'GET /health answers 200 with status "ok" and a whole-number uptime',
    async () => {
      const { status, text } = await request("/health");
      const body = JSON.parse(text);
      return (
        status === 200 && body.status === "ok" && Number.isInteger(body.uptime)
      );
    },
  );
  await check("GET /tasks answers 200 with an array", async () => {
    const { status, text } = await request("/tasks");
    return status === 200 && Array.isArray(JSON.parse(text));
  });
  await check(
    "POST /tasks with a title answers 201, and the task is in the next GET /tasks",
    async () => {
      const created = await post({ title: "smoke test" });
      const { id } = JSON.parse(created.text);
      const tasks = JSON.parse((await request("/tasks")).text);
      return created.status === 201 && tasks.some((task) => task.id === id);
    },
  );
  await check(
    "POST /tasks without a title answers 400",
    async () => (await post({})).status === 400,
  );
  await check("POST /tasks with a form body answers 400", async () => {
    const { status } = await request("/tasks", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "title=smoke+test",
    });
    return status === 400;
  });
  if (server) {
    await check("the server wrote one JSON log line per request", () =>
      waitFor(async () => httpLogLines().length === responses.length, 2000),
    );
  } else {
    await check("GET / answers 200 with HTML", async () => {
      const { status, type } = await request("/");
      return status === 200 && type.startsWith("text/html");
    });
  }
  await check("no response has an x-powered-by header", async () =>
    responses.every((response) => !response.headers.has("x-powered-by")),
  );
} catch (error) {
  console.error(`smoke failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  server?.kill();
}
