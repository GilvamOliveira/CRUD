"use strict";

(function () {
  const KEY = "db_client";

  const readRaw = () => {
    try {
      const data = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  };

  const write = (dbClient) =>
    localStorage.setItem(KEY, JSON.stringify(dbClient));

  const now = () => new Date().toISOString();

  const ensureDefaults = () => {
    const dbClient = readRaw();
    let maxId = dbClient.reduce(
      (max, client) => Math.max(max, Number(client.id) || 0),
      0,
    );
    let changed = false;

    dbClient.forEach((client) => {
      if (!(Number(client.id) > 0)) {
        maxId += 1;
        client.id = maxId;
        changed = true;
      }
      if (!client.criado_em) {
        client.criado_em = now();
        changed = true;
      }
      if (!client.atualizado_em) {
        client.atualizado_em = client.criado_em;
        changed = true;
      }
      if (client.excluido_em === undefined) {
        client.excluido_em = null;
        changed = true;
      }
    });

    if (changed) write(dbClient);
    return dbClient;
  };

  const active = () => ensureDefaults().filter((client) => !client.excluido_em);

  const validationError = (fields) => {
    const error = new Error("Verifique os campos destacados.");
    error.fields = fields;
    error.status = 422;
    return error;
  };

  const duplicateFields = (client, dbClient, ignoreId = null) => {
    const fields = {};
    if (
      dbClient.some(
        (c) =>
          !c.excluido_em &&
          String(c.id) !== String(ignoreId) &&
          c.email.toLowerCase() === client.email.toLowerCase(),
      )
    ) {
      fields.email = "Já existe um cliente com esse e-mail.";
    }
    if (
      dbClient.some(
        (c) =>
          !c.excluido_em &&
          String(c.id) !== String(ignoreId) &&
          c.celular === client.celular,
      )
    ) {
      fields.celular = "Já existe um cliente com esse celular.";
    }
    return fields;
  };

  const validate = (client, dbClient, ignoreId = null) => {
    const fields = {
      ...window.Validacao.validateClient(client),
      ...duplicateFields(client, dbClient, ignoreId),
    };
    if (Object.keys(fields).length) throw validationError(fields);
  };

  const compare = (a, b, sort) => {
    if (sort === "id") return (Number(a.id) || 0) - (Number(b.id) || 0);
    return String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""), "pt-BR");
  };

  const list = ({
    page = 1,
    limit = 5,
    busca = "",
    estado = "",
    cidade = "",
    sort = "id",
    direction = "asc",
  } = {}) => {
    const term = String(busca).trim().toLowerCase();
    const uf = String(estado).trim().toUpperCase();
    const city = String(cidade).trim().toLowerCase();

    let items = active();

    if (term) {
      items = items.filter((client) =>
        `${client.nome} ${client.email} ${client.celular} ${client.cidade} ${client.estado}`
          .toLowerCase()
          .includes(term),
      );
    }
    if (uf) items = items.filter((client) => client.estado === uf);
    if (city) {
      items = items.filter((client) =>
        String(client.cidade).toLowerCase().includes(city),
      );
    }

    items.sort((a, b) => {
      const result = compare(a, b, sort);
      return direction === "desc" ? -result : result;
    });

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * limit;

    return {
      items: items.slice(start, start + limit),
      total,
      page: safePage,
      limit,
      totalPages,
    };
  };

  const all = () => active();

  const create = (client) => {
    const dbClient = ensureDefaults();
    validate(client, dbClient);

    const created = {
      ...client,
      id:
        dbClient.reduce(
          (max, item) => Math.max(max, Number(item.id) || 0),
          0,
        ) + 1,
      criado_em: now(),
      atualizado_em: now(),
      excluido_em: null,
    };

    dbClient.push(created);
    write(dbClient);
    return created;
  };

  const update = (id, client) => {
    const dbClient = ensureDefaults();
    const index = dbClient.findIndex(
      (item) => !item.excluido_em && String(item.id) === String(id),
    );
    if (index < 0) {
      const error = new Error("Cliente não encontrado.");
      error.status = 404;
      throw error;
    }

    validate(client, dbClient, id);

    const updated = {
      ...client,
      id: dbClient[index].id,
      criado_em: dbClient[index].criado_em,
      atualizado_em: now(),
      excluido_em: null,
    };
    dbClient[index] = updated;
    write(dbClient);
    return updated;
  };

  const remove = (ids) => {
    const dbClient = ensureDefaults();
    const targets = new Set(ids.map(String));
    let deleted = 0;
    const timestamp = now();

    dbClient.forEach((client) => {
      if (!client.excluido_em && targets.has(String(client.id))) {
        client.excluido_em = timestamp;
        client.atualizado_em = timestamp;
        deleted += 1;
      }
    });

    write(dbClient);
    return { deleted };
  };

  const restore = (ids) => {
    const dbClient = ensureDefaults();
    const targets = new Set(ids.map(String));
    let restored = 0;
    const timestamp = now();

    dbClient.forEach((client) => {
      if (client.excluido_em && targets.has(String(client.id))) {
        const conflict = dbClient.some(
          (other) =>
            !other.excluido_em &&
            String(other.id) !== String(client.id) &&
            (other.email.toLowerCase() === client.email.toLowerCase() ||
              other.celular === client.celular),
        );
        if (conflict) return;
        client.excluido_em = null;
        client.atualizado_em = timestamp;
        restored += 1;
      }
    });

    write(dbClient);
    return { restored };
  };

  const stats = () => {
    const items = active();
    const counts = new Map();

    items.forEach((client) => {
      const estado = client.estado || "—";
      counts.set(estado, (counts.get(estado) ?? 0) + 1);
    });

    const porEstado = [...counts.entries()]
      .map(([estado, total]) => ({ estado, total }))
      .sort((a, b) => b.total - a.total || a.estado.localeCompare(b.estado));

    return { total: items.length, porEstado };
  };

  window.Storage = {
    list,
    all,
    create,
    update,
    remove,
    restore,
    stats,
  };
})();
