import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, relative, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(new URL(".", import.meta.url)), ".."));
const DB_PATH = process.env.DB_PATH
  ? normalize(process.env.DB_PATH)
  : join(ROOT, "server", "clientes.db");
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const AUTH_SECRET = process.env.ADMIN_SECRET ?? randomBytes(32).toString("hex");
const TOKEN_TTL = 8 * 60 * 60 * 1000;
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ??
  "http://localhost:3000,http://127.0.0.1:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const ESTADOS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\(\d{2}\) \d{5}-\d{4}$/;
const SORT_FIELDS = new Set([
  "id", "nome", "email", "celular", "cidade", "estado",
  "criado_em", "atualizado_em",
]);

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

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

const migrate = () => {
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

  const columns = db
    .prepare("PRAGMA table_info(clientes)")
    .all()
    .map((column) => column.name);

  db.exec("BEGIN");
  try {
    if (!columns.includes("criado_em")) {
      db.exec("ALTER TABLE clientes ADD COLUMN criado_em TEXT");
    }
    if (!columns.includes("atualizado_em")) {
      db.exec("ALTER TABLE clientes ADD COLUMN atualizado_em TEXT");
    }
    if (!columns.includes("excluido_em")) {
      db.exec("ALTER TABLE clientes ADD COLUMN excluido_em TEXT");
    }

    const now = new Date().toISOString();
    db.prepare(
      "UPDATE clientes SET criado_em = ? WHERE criado_em IS NULL",
    ).run(now);
    db.prepare(
      "UPDATE clientes SET atualizado_em = ? WHERE atualizado_em IS NULL",
    ).run(now);

    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_clientes_estado ON clientes(estado)",
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    console.error("Falha na migração:", error.message);
  }

  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_email_ativo
      ON clientes(lower(email)) WHERE excluido_em IS NULL
    `);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_celular_ativo
      ON clientes(celular) WHERE excluido_em IS NULL
    `);
  } catch (error) {
    console.warn(
      "Não foi possível criar os índices únicos (existem duplicados?):",
      error.message,
    );
  }
};

migrate();

const getStatement = db.prepare(
  "SELECT * FROM clientes WHERE id = ? AND excluido_em IS NULL",
);
const insertStatement = db.prepare(`
  INSERT INTO clientes (nome, email, celular, cidade, estado, criado_em, atualizado_em)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const updateStatement = db.prepare(`
  UPDATE clientes
  SET nome = ?, email = ?, celular = ?, cidade = ?, estado = ?, atualizado_em = ?
  WHERE id = ? AND excluido_em IS NULL
`);
const softDeleteStatement = db.prepare(`
  UPDATE clientes SET excluido_em = ?, atualizado_em = ?
  WHERE id = ? AND excluido_em IS NULL
`);
const restoreStatement = db.prepare(`
  UPDATE clientes SET excluido_em = NULL, atualizado_em = ?
  WHERE id = ?
`);
const emailExistsStatement = db.prepare(`
  SELECT id FROM clientes
  WHERE lower(email) = lower(?) AND excluido_em IS NULL AND id <> ?
`);
const phoneExistsStatement = db.prepare(`
  SELECT id FROM clientes
  WHERE celular = ? AND excluido_em IS NULL AND id <> ?
`);

const normalizeClient = (body) => ({
  nome: String(body?.nome ?? "").trim(),
  email: String(body?.email ?? "").trim(),
  celular: String(body?.celular ?? "").trim(),
  cidade: String(body?.cidade ?? "").trim(),
  estado: String(body?.estado ?? "").trim().toUpperCase(),
});

const validateClient = (client, ignoreId = 0) => {
  const fields = {};

  if (!client.nome) fields.nome = "Informe o nome.";
  else if (client.nome.length > 120) fields.nome = "Máximo de 120 caracteres.";

  if (!client.email) fields.email = "Informe o e-mail.";
  else if (!EMAIL_RE.test(client.email)) fields.email = "E-mail inválido.";
  else if (emailExistsStatement.get(client.email, ignoreId)) {
    fields.email = "Já existe um cliente com esse e-mail.";
  }

  if (!client.celular) fields.celular = "Informe o celular.";
  else if (!PHONE_RE.test(client.celular)) {
    fields.celular = "Use o formato (11) 99999-8888.";
  } else if (phoneExistsStatement.get(client.celular, ignoreId)) {
    fields.celular = "Já existe um cliente com esse celular.";
  }

  if (!client.cidade) fields.cidade = "Informe a cidade.";
  else if (client.cidade.length > 120) {
    fields.cidade = "Máximo de 120 caracteres.";
  }

  if (!client.estado) fields.estado = "Selecione o estado.";
  else if (!ESTADOS.has(client.estado)) fields.estado = "Estado inválido.";

  return fields;
};

const sendJson = (res, status, data, extraHeaders = {}) => {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(Object.assign(new Error("Payload muito grande."), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(Object.assign(new Error("JSON inválido."), { status: 400 }));
      }
    });
    req.on("error", reject);
  });

// Autenticação opcional por token (ativada quando ADMIN_PASSWORD é definida)

const sign = (payload) =>
  createHmac("sha256", AUTH_SECRET).update(payload).digest("base64url");

const createToken = () => {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + TOKEN_TTL }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
};

const verifyToken = (req) => {
  if (!ADMIN_PASSWORD) return true;
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) return false;

  const [payload, signature] = header.slice(7).split(".");
  if (!payload || !signature) return false;

  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return false;
  }

  try {
    const { exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    return Number(exp) > Date.now();
  } catch {
    return false;
  }
};

const passwordMatches = (senha) => {
  const expected = Buffer.from(ADMIN_PASSWORD);
  const received = Buffer.from(senha);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
};

// Rate limiting em memória

const buckets = new Map();

const rateLimit = (key, limit, windowMs) => {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= limit;
};

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref();

// Consulta com paginação, busca e ordenação no banco

const parseListQuery = (searchParams) => {
  const page = Math.max(1, Number.parseInt(searchParams.get("page"), 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(searchParams.get("limit"), 10) || 5),
  );
  const busca = (searchParams.get("busca") ?? "").trim();
  const estado = (searchParams.get("estado") ?? "").trim().toUpperCase();
  const cidade = (searchParams.get("cidade") ?? "").trim();
  const sort = SORT_FIELDS.has(searchParams.get("ordem"))
    ? searchParams.get("ordem")
    : "id";
  const direction =
    searchParams.get("direcao") === "desc" ? "DESC" : "ASC";

  return { page, limit, busca, estado, cidade, sort, direction };
};

const listClients = (query) => {
  const where = ["excluido_em IS NULL"];
  const params = [];

  if (query.busca) {
    const like = `%${query.busca}%`;
    where.push(
      "(nome LIKE ? OR email LIKE ? OR celular LIKE ? OR cidade LIKE ? OR estado LIKE ?)",
    );
    params.push(like, like, like, like, like);
  }
  if (query.estado) {
    where.push("estado = ?");
    params.push(query.estado);
  }
  if (query.cidade) {
    where.push("lower(cidade) LIKE lower(?)");
    params.push(`%${query.cidade}%`);
  }

  const whereSql = where.join(" AND ");
  const { total } = db
    .prepare(`SELECT COUNT(*) AS total FROM clientes WHERE ${whereSql}`)
    .get(...params);

  const offset = (query.page - 1) * query.limit;
  const items = db
    .prepare(`
      SELECT id, nome, email, celular, cidade, estado, criado_em, atualizado_em
      FROM clientes
      WHERE ${whereSql}
      ORDER BY ${query.sort} ${query.direction}, id ASC
      LIMIT ? OFFSET ?
    `)
    .all(...params, query.limit, offset);

  return {
    items,
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
};

const getStats = () => {
  const total = db
    .prepare("SELECT COUNT(*) AS total FROM clientes WHERE excluido_em IS NULL")
    .get().total;
  const porEstado = db
    .prepare(`
      SELECT estado, COUNT(*) AS total
      FROM clientes
      WHERE excluido_em IS NULL
      GROUP BY estado
      ORDER BY total DESC, estado ASC
    `)
    .all();
  return { total, porEstado };
};

const bulkOperation = (ids, operation) => {
  if (!Array.isArray(ids)) {
    throw Object.assign(new Error("Envie uma lista de IDs."), { status: 400 });
  }

  const now = new Date().toISOString();
  let changed = 0;

  for (const rawId of ids) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) continue;
    const result = operation(id, now);
    changed += result.changes;
  }

  return changed;
};

const handleApi = async (req, res, pathname, searchParams) => {
  const isPublic =
    pathname === "/api/health" || pathname === "/api/login";

  if (ADMIN_PASSWORD && !isPublic && !verifyToken(req)) {
    return sendJson(res, 401, { error: "Não autorizado." });
  }

  if (pathname === "/api/health" && req.method === "GET") {
    return sendJson(res, 200, {
      status: "ok",
      auth: Boolean(ADMIN_PASSWORD),
    });
  }

  if (pathname === "/api/login" && req.method === "POST") {
    if (!ADMIN_PASSWORD) {
      return sendJson(res, 200, { token: createToken(), auth: false });
    }
    if (!rateLimit(`login:${req.socket.remoteAddress}`, 5, 60_000)) {
      return sendJson(res, 429, {
        error: "Muitas tentativas. Tente novamente em 1 minuto.",
      });
    }
    const body = await readBody(req);
    if (!passwordMatches(String(body.senha ?? ""))) {
      return sendJson(res, 401, { error: "Senha incorreta." });
    }
    return sendJson(res, 200, { token: createToken(), auth: true });
  }

  if (pathname === "/api/estatisticas" && req.method === "GET") {
    return sendJson(res, 200, getStats());
  }

  if (pathname === "/api/clientes/lote/excluir" && req.method === "POST") {
    const body = await readBody(req);
    const changed = bulkOperation(body.ids, (id, now) =>
      softDeleteStatement.run(now, now, id),
    );
    return sendJson(res, 200, { deleted: changed });
  }

  if (pathname === "/api/clientes/lote/restaurar" && req.method === "POST") {
    const body = await readBody(req);
    const changed = bulkOperation(body.ids, (id, now) =>
      restoreStatement.run(now, id),
    );
    return sendJson(res, 200, { restored: changed });
  }

  const match = pathname.match(/^\/api\/clientes(?:\/(\d+))?$/);
  if (!match) return sendJson(res, 404, { error: "Rota não encontrada." });

  const id = match[1] ? Number(match[1]) : null;

  if (req.method === "GET" && id === null) {
    return sendJson(res, 200, listClients(parseListQuery(searchParams)));
  }

  if (req.method === "GET" && id !== null) {
    const client = getStatement.get(id);
    if (!client) {
      return sendJson(res, 404, { error: "Cliente não encontrado." });
    }
    return sendJson(res, 200, client);
  }

  if (req.method === "POST" && id === null) {
    if (!rateLimit(`create:${req.socket.remoteAddress}`, 30, 60_000)) {
      return sendJson(res, 429, { error: "Muitas requisições. Aguarde." });
    }

    const client = normalizeClient(await readBody(req));
    const fields = validateClient(client);
    if (Object.keys(fields).length) {
      return sendJson(res, 422, {
        error: "Verifique os campos destacados.",
        fields,
      });
    }

    const now = new Date().toISOString();
    const result = insertStatement.run(
      client.nome,
      client.email,
      client.celular,
      client.cidade,
      client.estado,
      now,
      now,
    );
    return sendJson(
      res,
      201,
      getStatement.get(Number(result.lastInsertRowid)),
    );
  }

  if (req.method === "PUT" && id !== null) {
    if (!getStatement.get(id)) {
      return sendJson(res, 404, { error: "Cliente não encontrado." });
    }

    const client = normalizeClient(await readBody(req));
    const fields = validateClient(client, id);
    if (Object.keys(fields).length) {
      return sendJson(res, 422, {
        error: "Verifique os campos destacados.",
        fields,
      });
    }

    updateStatement.run(
      client.nome,
      client.email,
      client.celular,
      client.cidade,
      client.estado,
      new Date().toISOString(),
      id,
    );
    return sendJson(res, 200, getStatement.get(id));
  }

  if (req.method === "DELETE" && id !== null) {
    if (!getStatement.get(id)) {
      return sendJson(res, 404, { error: "Cliente não encontrado." });
    }
    const now = new Date().toISOString();
    softDeleteStatement.run(now, now, id);
    return sendJson(res, 200, { deleted: id });
  }

  return sendJson(res, 405, { error: "Método não permitido." });
};

const securityHeaders = () => ({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Content-Security-Policy":
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self' data:; " +
    "script-src 'self'; connect-src 'self'",
});

const serveStatic = async (req, res, pathname) => {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(ROOT, requested));
  const relativePath = relative(ROOT, filePath);

  if (relativePath.startsWith(`..${sep}`) || relativePath === ".." || !relativePath) {
    return sendJson(res, 403, { error: "Acesso negado." });
  }

  if (relativePath.startsWith(`server${sep}`)) {
    return sendJson(res, 403, { error: "Acesso negado." });
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type":
        MIME_TYPES[extname(filePath).toLowerCase()] ??
        "application/octet-stream",
      ...securityHeaders(),
    });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: "Arquivo não encontrado." });
  }
};

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (pathname.startsWith("/api/")) {
      if (!rateLimit(`api:${req.socket.remoteAddress}`, 120, 60_000)) {
        return sendJson(res, 429, {
          error: "Muitas requisições. Aguarde um instante.",
        });
      }
      return await handleApi(req, res, pathname, url.searchParams);
    }

    if (req.method !== "GET") {
      return sendJson(res, 405, { error: "Método não permitido." });
    }
    return await serveStatic(req, res, pathname);
  } catch (error) {
    const status = error.status ?? 400;
    sendJson(res, status, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Servidor em http://localhost:${PORT}`);
  console.log(`API REST em http://localhost:${PORT}/api/clientes`);
  console.log(
    ADMIN_PASSWORD
      ? "Autenticação ativada (ADMIN_PASSWORD)."
      : "Autenticação desativada (defina ADMIN_PASSWORD para ativar).",
  );
});
