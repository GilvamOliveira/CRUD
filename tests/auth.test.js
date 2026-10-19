import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const PORT = 34700 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "senha-secreta";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let tempDir;
let child;

const request = async (path, options = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    // servidor ainda n�o respondeu
  }

  return { status: response.status, body };
};

const waitForServer = async () => {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {
    // servidor ainda n�o respondeu
  }
    await sleep(150);
  }
  throw new Error("Servidor de teste não iniciou.");
};

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "crud-auth-"));
  child = spawn(process.execPath, ["server/server.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: join(tempDir, "test.db"),
      ADMIN_PASSWORD: PASSWORD,
      ADMIN_SECRET: "segredo-de-teste",
    },
    stdio: "ignore",
  });
  await waitForServer();
});

after(async () => {
  if (child) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await exited;
  }
  await rm(tempDir, { recursive: true, force: true });
});

test("autenticação por token", async (t) => {
  let token;

  await t.test("health informa que a autenticação está ativa", async () => {
    const { body } = await request("/api/health");
    assert.equal(body.auth, true);
  });

  await t.test("bloqueia acesso sem token", async () => {
    const { status } = await request("/api/clientes");
    assert.equal(status, 401);
  });

  await t.test("rejeita senha incorreta", async () => {
    const { status } = await request("/api/login", {
      method: "POST",
      body: JSON.stringify({ senha: "errada" }),
    });
    assert.equal(status, 401);
  });

  await t.test("gera token com a senha correta", async () => {
    const { status, body } = await request("/api/login", {
      method: "POST",
      body: JSON.stringify({ senha: PASSWORD }),
    });
    assert.equal(status, 200);
    assert.ok(body.token);
    token = body.token;
  });

  await t.test("libera acesso autenticado", async () => {
    const list = await request("/api/clientes", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.items));

    const created = await request("/api/clientes", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        nome: "Cliente Protegido",
        email: "protegido@example.com",
        celular: "(11) 91234-5678",
        cidade: "São Paulo",
        estado: "SP",
      }),
    });
    assert.equal(created.status, 201);
  });

  await t.test("rejeita token inválido", async () => {
    const { status } = await request("/api/clientes", {
      headers: { Authorization: "Bearer token.falso" },
    });
    assert.equal(status, 401);
  });
});
