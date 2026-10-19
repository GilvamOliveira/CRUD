"use strict";

(function () {
  const PAGE_SIZE = 5;
  const { ESTADOS, maskPhone, escapeHtml } = window.Validacao;

  const busca = document.getElementById("busca");
  const filtroEstado = document.getElementById("filtroEstado");
  const filtroCidade = document.getElementById("filtroCidade");

  let mode = "local";
  let authRequired = false;
  let sortField = null;
  let sortAsc = true;
  let currentPage = 1;
  let selectedIds = new Set();
  let data = { items: [], total: 0, page: 1, totalPages: 1 };
  let overallTotal = 0;
  let searchTimer = null;
  let requestId = 0;

  const sourceList = (params) =>
    mode === "api" ? window.Api.list(params) : window.Storage.list(params);
  const sourceStats = () =>
    mode === "api" ? window.Api.stats() : window.Storage.stats();
  const sourceCreate = (client) =>
    mode === "api" ? window.Api.create(client) : window.Storage.create(client);
  const sourceUpdate = (id, client) =>
    mode === "api"
      ? window.Api.update(id, client)
      : window.Storage.update(id, client);
  const sourceRemove = (ids) =>
    mode === "api" ? window.Api.remove(ids) : window.Storage.remove(ids);
  const sourceRestore = (ids) =>
    mode === "api" ? window.Api.restore(ids) : window.Storage.restore(ids);

  const hasFilters = () =>
    Boolean(
      busca.value.trim() ||
        filtroEstado.value ||
        filtroCidade.value.trim(),
    );

  const getParams = () => ({
    page: currentPage,
    limit: PAGE_SIZE,
    busca: busca.value.trim(),
    estado: filtroEstado.value,
    cidade: filtroCidade.value.trim(),
    ordem: sortField ?? "id",
    direcao: sortAsc ? "asc" : "desc",
  });

  const openLogin = () => {
    document.getElementById("loginError").textContent = "";
    window.UI.openModal("loginModal", { initialFocus: "#senha" });
  };

  const handleError = (error) => {
    if (error?.unauthorized) {
      window.UI.toast("Sessão expirada. Faça login novamente.", "error");
      openLogin();
      return;
    }

    if (error?.fields) window.UI.setFieldErrors(error.fields);
    window.UI.toast(error?.message ?? "Erro inesperado.", "error");
  };

  const renderStats = (stats) => {
    const dashboard = document.getElementById("dashboard");
    const top = stats.porEstado[0];

    dashboard.hidden = stats.total === 0;
    if (stats.total === 0) {
      dashboard.innerHTML = "";
      return;
    }

    const chips = stats.porEstado
      .map(
        (item) =>
          `<span class="state-chip"><strong>${escapeHtml(item.estado)}</strong> ${item.total}</span>`,
      )
      .join("");

    dashboard.innerHTML = `
      <div class="stat-card">
        <span class="stat-label">Total de clientes</span>
        <strong class="stat-value">${stats.total}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">Estados atendidos</span>
        <strong class="stat-value">${stats.porEstado.length}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">Maior estado</span>
        <strong class="stat-value">${top ? `${escapeHtml(top.estado)} (${top.total})` : "—"}</strong>
      </div>
      <div class="stat-states">${chips}</div>
    `;
  };

  const updatePagination = () => {
    const pager = document.getElementById("paginacao");
    pager.hidden = data.totalPages <= 1;

    document.getElementById("paginaInfo").textContent =
      `Página ${data.page} de ${data.totalPages}`;
    document.getElementById("paginaAnterior").disabled = data.page === 1;
    document.getElementById("paginaProxima").disabled =
      data.page === data.totalPages;
  };

  const syncSelectionUI = () => {
    const checkboxes = [
      ...document.querySelectorAll(".selecionar-cliente"),
    ];
    const allSelected =
      checkboxes.length > 0 &&
      checkboxes.every((checkbox) => checkbox.checked);
    const someSelected = checkboxes.some((checkbox) => checkbox.checked);

    const selectAll = document.getElementById("selecionarTodos");
    selectAll.checked = allSelected;
    selectAll.indeterminate = !allSelected && someSelected;

    const bulkButton = document.getElementById("excluirSelecionados");
    bulkButton.disabled = selectedIds.size === 0;
    bulkButton.textContent = selectedIds.size
      ? `Excluir selecionados (${selectedIds.size})`
      : "Excluir selecionados";
  };

  const createRow = (client) => {
    const row = document.createElement("tr");
    const id = escapeHtml(String(client.id));

    row.innerHTML = `
      <td class="check-col">
        <input type="checkbox" class="selecionar-cliente" data-id="${id}"
          aria-label="Selecionar ${escapeHtml(client.nome)}"
          ${selectedIds.has(String(client.id)) ? "checked" : ""} />
      </td>
      <td>${escapeHtml(client.nome)}</td>
      <td>${escapeHtml(client.email)}</td>
      <td>${escapeHtml(client.celular)}</td>
      <td>${escapeHtml(client.cidade)}</td>
      <td>${escapeHtml(client.estado ?? "")}</td>
      <td>
        <button type="button" class="button green" data-action="edit" data-id="${id}">Editar</button>
        <button type="button" class="button red" data-action="delete" data-id="${id}">Excluir</button>
      </td>
    `;

    document.querySelector("#tableClient>tbody").appendChild(row);
  };

  const renderTable = () => {
    const tbody = document.querySelector("#tableClient>tbody");
    tbody.innerHTML = "";

    const visible = data.items.length;
    data.items.forEach(createRow);

    const empty = document.getElementById("vazio");
    empty.hidden = visible > 0;
    empty.textContent =
      overallTotal === 0
        ? 'Cadastre o primeiro cliente clicando em "Cadastrar Cliente".'
        : "Nenhum cliente encontrado com os filtros atuais.";

    document.getElementById("contador").textContent = hasFilters()
      ? `${data.total} de ${overallTotal} cliente(s) encontrado(s).`
      : `${data.total} cliente(s) cadastrado(s).`;

    document
      .querySelectorAll("#tableClient thead th[data-field]")
      .forEach((th) => {
        th.classList.toggle(
          "sort-asc",
          th.dataset.field === sortField && sortAsc,
        );
        th.classList.toggle(
          "sort-desc",
          th.dataset.field === sortField && !sortAsc,
        );
      });

    updatePagination();
    syncSelectionUI();
  };

  const loadAll = async ({ resetPage = false } = {}) => {
    if (resetPage) currentPage = 1;
    const currentRequest = ++requestId;
    window.UI.loading(true);

    try {
      const [result, stats] = await Promise.all([
        sourceList(getParams()),
        sourceStats(),
      ]);

      if (currentRequest !== requestId) return;

      data = result;
      currentPage = result.page;
      overallTotal = stats.total;
      selectedIds = new Set();

      renderStats(stats);
      renderTable();
      window.UI.setModeBanner(mode, authRequired);
    } catch (error) {
      if (currentRequest === requestId) handleError(error);
    } finally {
      if (currentRequest === requestId) window.UI.loading(false);
    }
  };

  const openNewClient = () => {
    window.UI.clearFieldErrors();
    document.getElementById("form").reset();
    document.getElementById("nome").dataset.id = "new";
    document.getElementById("modalTitle").textContent = "Novo Cliente";
    window.UI.openModal("modal", {
      initialFocus: "#nome",
      onEscape: closeClientModal,
    });
  };

  const closeClientModal = () => {
    window.UI.closeModal("modal");
    document.getElementById("form").reset();
    document.getElementById("nome").dataset.id = "new";
    document.getElementById("modalTitle").textContent = "Novo Cliente";
    window.UI.clearFieldErrors();
  };

  const fillFields = (client) => {
    document.getElementById("nome").value = client.nome;
    document.getElementById("email").value = client.email;
    document.getElementById("celular").value = client.celular;
    document.getElementById("cidade").value = client.cidade;
    document.getElementById("estado").value = client.estado ?? "";
    document.getElementById("nome").dataset.id = client.id;
  };

  const editClient = (id) => {
    const client = data.items.find(
      (item) => String(item.id) === String(id),
    );
    if (!client) return;

    window.UI.clearFieldErrors();
    fillFields(client);
    document.getElementById("modalTitle").textContent = "Editar Cliente";
    window.UI.openModal("modal", {
      initialFocus: "#nome",
      onEscape: closeClientModal,
    });
  };

  const saveClient = async () => {
    const client = {
      nome: document.getElementById("nome").value.trim(),
      email: document.getElementById("email").value.trim(),
      celular: document.getElementById("celular").value.trim(),
      cidade: document.getElementById("cidade").value.trim(),
      estado: document.getElementById("estado").value,
    };

    const fields = window.Validacao.validateClient(client);
    if (Object.keys(fields).length) {
      window.UI.setFieldErrors(fields);
      return;
    }

    const id = document.getElementById("nome").dataset.id || "new";
    const isNew = id === "new";
    window.UI.loading(true);

    try {
      if (isNew) {
        await sourceCreate(client);
        sortField = "id";
        sortAsc = false;
        currentPage = 1;
      } else {
        await sourceUpdate(id, client);
      }
    } catch (error) {
      window.UI.loading(false);
      handleError(error);
      return;
    }

    window.UI.loading(false);
    closeClientModal();
    window.UI.toast(
      isNew ? "Cliente cadastrado com sucesso." : "Cliente atualizado.",
      "success",
    );
    await loadAll();
  };

  const deleteClients = async (ids, description) => {
    const confirm = await window.UI.confirm(description, {
      title: "Excluir cliente(s)",
      okLabel: "Excluir",
      danger: true,
    });
    if (!confirm) return;

    window.UI.loading(true);
    try {
      await sourceRemove(ids);
    } catch (error) {
      window.UI.loading(false);
      handleError(error);
      return;
    }
    window.UI.loading(false);
    await loadAll();

    window.UI.toast(
      `${ids.length} cliente(s) excluído(s).`,
      "success",
      {
        actionLabel: "Desfazer",
        onAction: async () => {
          try {
            await sourceRestore(ids);
            await loadAll();
            window.UI.toast("Exclusão desfeita.", "success");
          } catch (error) {
            handleError(error);
          }
        },
      },
    );
  };

  const editDelete = (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;

    if (action === "edit") {
      editClient(id);
      return;
    }

    const client = data.items.find(
      (item) => String(item.id) === String(id),
    );
    if (!client) return;

    deleteClients(
      [client.id],
      `Deseja realmente excluir o(a) cliente ${client.nome}?`,
    );
  };

  const getAllClients = async () => {
    if (mode === "local") return window.Storage.all();

    const all = [];
    let page = 1;
    let totalPages = 1;

    do {
      const result = await window.Api.list({
        page,
        limit: 100,
        ordem: "id",
        direcao: "asc",
      });
      all.push(...result.items);
      totalPages = result.totalPages;
      page += 1;
    } while (page <= totalPages);

    return all;
  };

  const downloadFile = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportCsv = async () => {
    window.UI.loading(true);
    try {
      const clients = await getAllClients();
      const headers = ["Nome", "E-mail", "Celular", "Cidade", "Estado"];
      const rows = clients.map((client) => [
        client.nome,
        client.email,
        client.celular,
        client.cidade,
        client.estado ?? "",
      ]);
      const csv = [headers, ...rows]
        .map((row) =>
          row
            .map((value) => `"${String(value).replace(/"/g, '""')}"`)
            .join(";"),
        )
        .join("\r\n");
      downloadFile(`\uFEFF${csv}`, "clientes.csv", "text/csv;charset=utf-8;");
    } catch (error) {
      handleError(error);
    } finally {
      window.UI.loading(false);
    }
  };

  const exportBackup = async () => {
    window.UI.loading(true);
    try {
      const clients = await getAllClients();
      downloadFile(
        JSON.stringify(clients, null, 2),
        "clientes-backup.json",
        "application/json",
      );
    } catch (error) {
      handleError(error);
    } finally {
      window.UI.loading(false);
    }
  };

  const importBackup = (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch {
        window.UI.toast("Arquivo inválido: não foi possível ler o JSON.", "error");
        return;
      }

      if (!Array.isArray(parsed)) {
        window.UI.toast(
          "Arquivo inválido: o backup deve conter uma lista de clientes.",
          "error",
        );
        return;
      }

      const valid = [];
      const seenEmails = new Set();
      const seenPhones = new Set();
      let skipped = 0;

      parsed.forEach((item) => {
        const client = window.Validacao.normalizeClient(item);
        const fields = window.Validacao.validateClient(client);

        if (Object.keys(fields).length) {
          skipped += 1;
          return;
        }
        if (
          seenEmails.has(client.email.toLowerCase()) ||
          seenPhones.has(client.celular)
        ) {
          skipped += 1;
          return;
        }

        seenEmails.add(client.email.toLowerCase());
        seenPhones.add(client.celular);
        valid.push(client);
      });

      if (!valid.length) {
        window.UI.toast(
          `Nenhum cliente válido no arquivo. ${skipped} registro(s) ignorado(s).`,
          "error",
        );
        return;
      }

      const confirm = await window.UI.confirm(
        `Importar ${valid.length} cliente(s)?${skipped ? ` ${skipped} registro(s) inválido(s) ou duplicado(s) no arquivo serão ignorados.` : ""}`,
        { title: "Importar backup", okLabel: "Importar", danger: false },
      );
      if (!confirm) return;

      window.UI.loading(true);
      let imported = 0;
      let failed = skipped;

      for (const client of valid) {
        try {
          await sourceCreate(client);
          imported += 1;
        } catch {
          failed += 1;
        }
      }

      window.UI.loading(false);
      await loadAll();
      window.UI.toast(
        `Importação concluída: ${imported} adicionado(s), ${failed} ignorado(s).`,
        imported ? "success" : "error",
      );
    };

    reader.onerror = () =>
      window.UI.toast("Não foi possível ler o arquivo selecionado.", "error");
    reader.readAsText(file);
  };

  const populateStateFilter = () => {
    filtroEstado.innerHTML =
      '<option value="">Todos os estados</option>' +
      ESTADOS.map((estado) => `<option value="${estado}">${estado}</option>`).join("");
  };

  const debouncedLoad = (delay) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadAll({ resetPage: true }), delay);
  };

  // Eventos

  populateStateFilter();

  document
    .getElementById("cadastrarCliente")
    .addEventListener("click", openNewClient);

  document
    .getElementById("modalClose")
    .addEventListener("click", closeClientModal);

  document.getElementById("cancelar").addEventListener("click", closeClientModal);

  document.getElementById("salvar").addEventListener("click", saveClient);

  document
    .getElementById("form")
    .addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveClient();
      }
    });

  document
    .getElementById("celular")
    .addEventListener("input", (event) => {
      event.target.value = maskPhone(event.target.value);
    });

  document
    .querySelector("#tableClient>tbody")
    .addEventListener("click", editDelete);

  document
    .querySelector("#tableClient>tbody")
    .addEventListener("change", (event) => {
      if (!event.target.classList.contains("selecionar-cliente")) return;
      const id = event.target.dataset.id;
      if (event.target.checked) selectedIds.add(String(id));
      else selectedIds.delete(String(id));
      syncSelectionUI();
    });

  document
    .getElementById("selecionarTodos")
    .addEventListener("change", (event) => {
      document.querySelectorAll(".selecionar-cliente").forEach((checkbox) => {
        checkbox.checked = event.target.checked;
        const id = String(checkbox.dataset.id);
        if (event.target.checked) selectedIds.add(id);
        else selectedIds.delete(id);
      });
      syncSelectionUI();
    });

  document
    .getElementById("excluirSelecionados")
    .addEventListener("click", () => {
      if (!selectedIds.size) return;
      deleteClients(
        [...selectedIds],
        `Deseja realmente excluir ${selectedIds.size} cliente(s) selecionado(s)?`,
      );
    });

  busca.addEventListener("input", () => debouncedLoad(300));
  filtroCidade.addEventListener("input", () => debouncedLoad(400));
  filtroEstado.addEventListener("change", () =>
    loadAll({ resetPage: true }),
  );

  document.getElementById("limparFiltros").addEventListener("click", () => {
    busca.value = "";
    filtroEstado.value = "";
    filtroCidade.value = "";
    loadAll({ resetPage: true });
  });

  document.getElementById("paginaAnterior").addEventListener("click", () => {
    currentPage = Math.max(1, currentPage - 1);
    loadAll();
  });

  document.getElementById("paginaProxima").addEventListener("click", () => {
    currentPage = Math.min(data.totalPages, currentPage + 1);
    loadAll();
  });

  document
    .querySelector("#tableClient thead")
    .addEventListener("click", (event) => {
      const field = event.target.dataset.field;
      if (!field) return;
      sortAsc = sortField === field ? !sortAsc : true;
      sortField = field;
      loadAll({ resetPage: true });
    });

  document.getElementById("exportarCsv").addEventListener("click", exportCsv);
  document
    .getElementById("exportarBackup")
    .addEventListener("click", exportBackup);

  document
    .getElementById("importarBackup")
    .addEventListener("click", () =>
      document.getElementById("arquivoBackup").click(),
    );

  document
    .getElementById("arquivoBackup")
    .addEventListener("change", importBackup);

  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const senha = document.getElementById("senha").value;
    const errorElement = document.getElementById("loginError");
    errorElement.textContent = "";
    window.UI.loading(true);

    try {
      await window.Api.login(senha);
      window.UI.closeModal("loginModal");
      document.getElementById("senha").value = "";
      window.UI.toast("Login realizado.", "success");
      await loadAll();
    } catch (error) {
      errorElement.textContent = error.message;
    } finally {
      window.UI.loading(false);
    }
  });

  document.getElementById("sair").addEventListener("click", () => {
    window.Api.logout();
    openLogin();
  });

  const init = async () => {
    if (
      location.protocol !== "file:" &&
      !location.hostname.endsWith("github.io")
    ) {
      try {
        const health = await window.Api.health();
        if (health?.status === "ok") {
          mode = "api";
          authRequired = Boolean(health.auth);
        }
      } catch {
        mode = "local";
      }
    }

    window.UI.setModeBanner(mode, authRequired);

    if (mode === "api" && authRequired && !window.Api.hasToken()) {
      openLogin();
      return;
    }

    await loadAll();
  };

  init();
})();
