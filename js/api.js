"use strict";

(function () {
  const TOKEN_KEY = "crud_token";
  const base = () =>
    location.protocol.startsWith("http")
      ? `${location.origin}/api`
      : "http://localhost:3000/api";

  const getToken = () => localStorage.getItem(TOKEN_KEY);

  const request = async (path, options = {}) => {
    const token = getToken();
    const headers = {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    };

    let response;
    try {
      response = await fetch(`${base()}${path}`, { ...options, headers });
    } catch {
      const error = new Error("Servidor indisponível.");
      error.offline = true;
      throw error;
    }

    if (!response.ok) {
      let body = null;
      try {
        body = await response.json();
      } catch {
        // resposta sem corpo JSON
      }

      const error = new Error(
        body?.error ?? "Erro na comunicação com o servidor.",
      );
      error.status = response.status;
      error.fields = body?.fields;
      if (response.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        error.unauthorized = true;
      }
      throw error;
    }

    return response.status === 204 ? null : response.json();
  };

  const toQuery = (params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        search.set(key, value);
      }
    });
    const query = search.toString();
    return query ? `?${query}` : "";
  };

  const health = () => request("/health");

  const login = async (senha) => {
    const data = await request("/login", {
      method: "POST",
      body: JSON.stringify({ senha }),
    });
    if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
    return data;
  };

  const logout = () => localStorage.removeItem(TOKEN_KEY);

  const list = (params) => request(`/clientes${toQuery(params)}`);

  const create = (client) =>
    request("/clientes", { method: "POST", body: JSON.stringify(client) });

  const update = (id, client) =>
    request(`/clientes/${id}`, {
      method: "PUT",
      body: JSON.stringify(client),
    });

  const remove = (ids) =>
    request("/clientes/lote/excluir", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });

  const restore = (ids) =>
    request("/clientes/lote/restaurar", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });

  const stats = () => request("/estatisticas");

  window.Api = {
    base,
    hasToken: () => Boolean(getToken()),
    health,
    login,
    logout,
    list,
    create,
    update,
    remove,
    restore,
    stats,
  };
})();
