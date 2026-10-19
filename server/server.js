import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { extname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(new URL(".", import.meta.url)), ".."));
const DB_PATH = join(ROOT, "server", "clientes.db");
const PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    celular TEXT NOT NULL,
    cidade TEXT NOT NULL,
    estado TEXT NOT NULL
  )
`);

const listStatement = db.prepare(
  "SELECT id, nome, email, celular, cidade, estado FROM clientes ORDER BY id",
);
const getStatement = db.prepare("SELECT * FROM clientes WHERE id = ?");
const insertStatement = db.prepare(
  "INSERT INTO clientes (nome, email, celular, cidade, estado) VALUES (?, ?, ?, ?, ?)",
);
const updateStatement = db.prepare(
  "UPDATE clientes SET nome = ?, email = ?, celular = ?, cidade = ?, estado = ? WHERE id = ?",
);
const deleteStatement = db.prepare("DELETE FROM clientes WHERE id = ?");

const normalizeClient = (body) => ({
  nome: String(body?.nome ?? "").trim(),
  email: String(body?.email ?? "").trim(),
  celular: String(body?.celular ?? "").trim(),
  cidade: String(body?.cidade ?? "").trim(),
  estado: String(body?.estado ?? "").trim().toUpperCase(),
});

const findDuplicates = (client, ignoreId = null) => {
  const rows = listStatement.all();
  return {
    email: rows.some(
      (c) =>
        c.email.toLowerCase() === client.email.toLowerCase() &&
        c.id !== ignoreId,
    ),
    celular: rows.some(
      (c) => c.celular === client.celular && c.id !== ignoreId,
    ),
  };
};

const validate = (client, ignoreId = null) => {
  if (!client.nome || !client.email || !client.celular || !client.cidade || !client.estado) {
    return { status: 400, error: "Preencha todos os campos." };
  }
  const duplicated = findDuplicates(client, ignoreId);
  if (duplicated.email) {
    return { status: 409, error: "Já existe um cliente com esse e-mail." };
  }
  if (duplicated.celular) {
    return { status: 409, error: "Já existe um cliente com esse celular." };
  }
  return null;
};

const sendJson = (res, status, data) => {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error("Payload muito grande."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("JSON inválido."));
      }
    });
    req.on("error", reject);
  });

const handleApi = async (req, res, pathname) => {
  const match = pathname.match(/^\/api\/clientes(?:\/(\d+))?$/);

  if (pathname === "/api/health" && req.method === "GET") {
    return sendJson(res, 200, { status: "ok" });
  }

  if (!match) return sendJson(res, 404, { error: "Rota não encontrada." });

  const id = match[1] ? Number(match[1]) : null;

  if (req.method === "GET" && id === null) {
    return sendJson(res, 200, listStatement.all());
  }

  if (req.method === "GET" && id !== null) {
    const client = getStatement.get(id);
    if (!client) return sendJson(res, 404, { error: "Cliente não encontrado." });
    return sendJson(res, 200, client);
  }

  if (req.method === "POST" && id === null) {
    const client = normalizeClient(await readBody(req));
    const invalid = validate(client);
    if (invalid) return sendJson(res, invalid.status, { error: invalid.error });
    const result = insertStatement.run(
      client.nome,
      client.email,
      client.celular,
      client.cidade,
      client.estado,
    );
    return sendJson(res, 201, getStatement.get(result.lastInsertRowid));
  }

  if (req.method === "PUT" && id !== null) {
    if (!getStatement.get(id)) {
      return sendJson(res, 404, { error: "Cliente não encontrado." });
    }
    const client = normalizeClient(await readBody(req));
    const invalid = validate(client, id);
    if (invalid) return sendJson(res, invalid.status, { error: invalid.error });
    updateStatement.run(
      client.nome,
      client.email,
      client.celular,
      client.cidade,
      client.estado,
      id,
    );
    return sendJson(res, 200, getStatement.get(id));
  }

  if (req.method === "DELETE" && id !== null) {
    if (!getStatement.get(id)) {
      return sendJson(res, 404, { error: "Cliente não encontrado." });
    }
    deleteStatement.run(id);
    return sendJson(res, 200, { deleted: id });
  }

  return sendJson(res, 405, { error: "Método não permitido." });
};

const serveStatic = async (req, res, pathname) => {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(ROOT, requested));

  if (relative(ROOT, filePath).startsWith(`..${sep}`) || filePath === ROOT) {
    return sendJson(res, 403, { error: "Acesso negado." });
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: "Arquivo não encontrado." });
  }
};

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);

  try {
    if (pathname.startsWith("/api/")) {
      return await handleApi(req, res, pathname);
    }
    if (req.method !== "GET") {
      return sendJson(res, 405, { error: "Método não permitido." });
    }
    return await serveStatic(req, res, pathname);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Servidor em http://localhost:${PORT}`);
  console.log(`API REST em http://localhost:${PORT}/api/clientes`);
});
