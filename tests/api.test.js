import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const PORT = 34100 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;

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

const createClient = (overrides = {}) => {
  const index = Math.floor(Math.random() * 1e6);
  return request("/api/clientes", {
    method: "POST",
    body: JSON.stringify({
      nome: `Cliente ${index}`,
      email: `cliente${index}@example.com`,
      celular: `(11) 9${String(index).padStart(4, "0").slice(0, 4)}-0000`,
      cidade: "São Paulo",
      estado: "SP",
      ...overrides,
    }),
  });
};

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "crud-api-"));
  child = spawn(process.execPath, ["server/server.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: join(tempDir, "test.db"),
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

test("API REST de clientes", async (t) => {
  await t.test("health responde e informa autenticação desativada", async () => {
    const { status, body } = await request("/api/health");
    assert.equal(status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.auth, false);
  });

  await t.test("valida campos obrigatórios e formatos", async () => {
    const empty = await request("/api/clientes", {
      method: "POST",
      body: JSON.stringify({}),
    });
    assert.equal(empty.status, 422);
    assert.ok(empty.body.fields.nome);
    assert.ok(empty.body.fields.email);
    assert.ok(empty.body.fields.celular);
    assert.ok(empty.body.fields.cidade);
    assert.ok(empty.body.fields.estado);

    const invalid = await request("/api/clientes", {
      method: "POST",
      body: JSON.stringify({
        nome: "Teste",
        email: "email-invalido",
        celular: "11999998888",
        cidade: "São Paulo",
        estado: "XX",
      }),
    });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.body.fields.email, "E-mail inválido.");
    assert.equal(
      invalid.body.fields.celular,
      "Use o formato (11) 99999-8888.",
    );
    assert.equal(invalid.body.fields.estado, "Estado inválido.");
  });

  const ids = [];

  await t.test("cadastra clientes válidos", async () => {
    for (let i = 1; i <= 7; i++) {
      const { status, body } = await createClient({
        nome: `Cliente ${i}`,
        email: `cliente${i}@example.com`,
        celular: `(11) 9000${i}-000${i}`,
        cidade: i === 7 ? "Rio de Janeiro" : "Campinas",
        estado: i === 7 ? "RJ" : "SP",
      });
      assert.equal(status, 201);
      assert.ok(body.id);
      assert.ok(body.criado_em);
      assert.ok(body.atualizado_em);
      ids.push(body.id);
    }
  });

  await t.test("bloqueia e-mail e celular duplicados", async () => {
    const email = await createClient({
      email: "CLIENTE1@example.com",
    });
    assert.equal(email.status, 422);
    assert.equal(
      email.body.fields.email,
      "Já existe um cliente com esse e-mail.",
    );

    const phone = await createClient({
      celular: "(11) 90001-0001",
    });
    assert.equal(phone.status, 422);
    assert.equal(
      phone.body.fields.celular,
      "Já existe um cliente com esse celular.",
    );
  });

  await t.test("pagina os resultados no banco", async () => {
    const page1 = await request("/api/clientes?page=1&limit=5");
    assert.equal(page1.status, 200);
    assert.equal(page1.body.total, 7);
    assert.equal(page1.body.totalPages, 2);
    assert.equal(page1.body.items.length, 5);

    const page2 = await request("/api/clientes?page=2&limit=5");
    assert.equal(page2.body.items.length, 2);
    assert.equal(page2.body.page, 2);
  });

  await t.test("busca, filtra e ordena", async () => {
    const busca = await request("/api/clientes?busca=Cliente%203");
    assert.equal(busca.body.total, 1);
    assert.equal(busca.body.items[0].nome, "Cliente 3");

    const estado = await request("/api/clientes?estado=RJ");
    assert.equal(estado.body.total, 1);
    assert.equal(estado.body.items[0].estado, "RJ");

    const cidade = await request("/api/clientes?cidade=Campinas");
    assert.equal(cidade.body.total, 6);

    const ordem = await request(
      "/api/clientes?ordem=nome&direcao=desc&limit=1",
    );
    assert.equal(ordem.body.items[0].nome, "Cliente 7");
  });

  await t.test("atualiza um cliente e mantém validação", async () => {
    const updated = await request(`/api/clientes/${ids[0]}`, {
      method: "PUT",
      body: JSON.stringify({
        nome: "Cliente Atualizado",
        email: "cliente1@example.com",
        celular: "(11) 90001-0001",
        cidade: "Santos",
        estado: "SP",
      }),
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.nome, "Cliente Atualizado");
    assert.equal(updated.body.cidade, "Santos");

    const duplicated = await request(`/api/clientes/${ids[0]}`, {
      method: "PUT",
      body: JSON.stringify({
        nome: "Cliente Atualizado",
        email: "cliente2@example.com",
        celular: "(11) 90001-0001",
        cidade: "Santos",
        estado: "SP",
      }),
    });
    assert.equal(duplicated.status, 422);
    assert.equal(
      duplicated.body.fields.email,
      "Já existe um cliente com esse e-mail.",
    );
  });

  await t.test("retorna estatísticas por estado", async () => {
    const { status, body } = await request("/api/estatisticas");
    assert.equal(status, 200);
    assert.equal(body.total, 7);
    const sp = body.porEstado.find((item) => item.estado === "SP");
    const rj = body.porEstado.find((item) => item.estado === "RJ");
    assert.equal(sp.total, 6);
    assert.equal(rj.total, 1);
  });

  await t.test("exclui e restaura em lote (soft delete)", async () => {
    const removed = await request("/api/clientes/lote/excluir", {
      method: "POST",
      body: JSON.stringify({ ids: ids.slice(0, 3) }),
    });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.deleted, 3);

    const afterDelete = await request("/api/clientes?limit=100");
    assert.equal(afterDelete.body.total, 4);
    assert.equal(
      (await request(`/api/clientes/${ids[0]}`)).status,
      404,
    );

    const restored = await request("/api/clientes/lote/restaurar", {
      method: "POST",
      body: JSON.stringify({ ids: ids.slice(0, 3) }),
    });
    assert.equal(restored.status, 200);
    assert.equal(restored.body.restored, 3);

    const afterRestore = await request("/api/clientes?limit=100");
    assert.equal(afterRestore.body.total, 7);
  });

  await t.test("exclui um cliente e responde 404 para rotas inválidas", async () => {
    const removed = await request(`/api/clientes/${ids[6]}`, {
      method: "DELETE",
    });
    assert.equal(removed.status, 200);

    const list = await request("/api/clientes?limit=100");
    assert.equal(list.body.total, 6);

    const missing = await request(`/api/clientes/${ids[6]}`);
    assert.equal(missing.status, 404);

    const route = await request("/api/desconhecida");
    assert.equal(route.status, 404);
  });
});
