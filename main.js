"use strict";

const PAGE_SIZE = 5;
const API_URL = location.protocol.startsWith("http")
  ? `${location.origin}/api`
  : "http://localhost:3000/api";

let sortField = null;
let sortAsc = true;
let currentPage = 1;
let clientes = [];
let useApi = false;

const CSV_HEADERS = ["Nome", "E-mail", "Celular", "Cidade", "Estado"];

const openModal = () => {
  document.getElementById("modal").classList.add("active");
  document.getElementById("nome").focus();
};

const closeModal = () => {
  clearFields();
  document.getElementById("nome").dataset.id = "new";
  document.getElementById("modalTitle").textContent = "Novo Cliente";
  document.getElementById("modal").classList.remove("active");
};

// Persistência local (fallback)

const getLocalStorage = () =>
  JSON.parse(localStorage.getItem("db_client")) ?? [];
const setLocalStorage = (dbClient) =>
  localStorage.setItem("db_client", JSON.stringify(dbClient));

const localList = () => {
  const dbClient = getLocalStorage();
  let maxId = dbClient.reduce((max, c) => Math.max(max, Number(c.id) || 0), 0);
  let migrated = false;

  dbClient.forEach((client) => {
    if (!(Number(client.id) > 0)) {
      maxId += 1;
      client.id = maxId;
      migrated = true;
    }
  });

  if (migrated) setLocalStorage(dbClient);
  return dbClient;
};

const localCreate = (client) => {
  const dbClient = localList();
  const created = {
    ...client,
    id: dbClient.reduce((max, c) => Math.max(max, Number(c.id) || 0), 0) + 1,
  };
  dbClient.push(created);
  setLocalStorage(dbClient);
  return created;
};

const localUpdate = (id, client) => {
  const dbClient = localList();
  const index = dbClient.findIndex((c) => String(c.id) === String(id));
  if (index < 0) return null;
  const updated = { ...client, id: dbClient[index].id };
  dbClient[index] = updated;
  setLocalStorage(dbClient);
  return updated;
};

const localRemove = (id) => {
  const dbClient = localList().filter((c) => String(c.id) !== String(id));
  setLocalStorage(dbClient);
};

// API REST

const apiRequest = async (path, options = {}) => {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    let message = "Erro na comunicação com o servidor.";
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {}
    throw new Error(message);
  }

  return response.json();
};

const detectDataSource = async () => {
  if (location.protocol === "file:" || location.hostname.endsWith("github.io")) {
    useApi = false;
    return;
  }

  try {
    const response = await fetch(`${API_URL}/health`, { cache: "no-store" });
    useApi = response.ok;
  } catch {
    useApi = false;
  }
};

// Camada de dados (API ou localStorage)

const loadClients = async () =>
  useApi ? apiRequest("/clientes") : localList();

const createClient = async (client) =>
  useApi
    ? apiRequest("/clientes", { method: "POST", body: JSON.stringify(client) })
    : localCreate(client);

const updateClient = async (id, client) =>
  useApi
    ? apiRequest(`/clientes/${id}`, {
        method: "PUT",
        body: JSON.stringify(client),
      })
    : localUpdate(id, client);

const removeClient = async (id) =>
  useApi
    ? apiRequest(`/clientes/${id}`, { method: "DELETE" })
    : localRemove(id);

const refresh = async () => {
  try {
    clientes = await loadClients();
  } catch {
    clientes = [];
  }
  renderTable();
};

// Interação com o layout

const clearFields = () => {
  const fields = document.querySelectorAll("#form .modal-field");
  fields.forEach((field) => (field.value = ""));
};

const isValidFields = () => {
  return document.getElementById("form").reportValidity();
};

const findDuplicated = (client, id) => ({
  email: clientes.some(
    (c) =>
      c.email.toLowerCase() === client.email.toLowerCase() &&
      String(c.id) !== String(id),
  ),
  celular: clientes.some(
    (c) => c.celular === client.celular && String(c.id) !== String(id),
  ),
});

const saveClient = async () => {
  if (!isValidFields()) return;

  const client = {
    nome: document.getElementById("nome").value.trim(),
    email: document.getElementById("email").value.trim(),
    celular: document.getElementById("celular").value.trim(),
    cidade: document.getElementById("cidade").value.trim(),
    estado: document.getElementById("estado").value,
  };

  if (!client.nome || !client.email || !client.cidade) {
    alert("Preencha todos os campos.");
    return;
  }

  const id = document.getElementById("nome").dataset.id || "new";
  const duplicated = findDuplicated(client, id);

  if (duplicated.email) {
    alert("Já existe um cliente com esse e-mail.");
    return;
  }
  if (duplicated.celular) {
    alert("Já existe um cliente com esse celular.");
    return;
  }

  try {
    if (id === "new") {
      await createClient(client);
    } else {
      await updateClient(id, client);
    }
  } catch (error) {
    alert(error.message);
    return;
  }

  await refresh();
  closeModal();
};

const escapeHtml = (text) => {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
};

const createRow = (client) => {
  const newRow = document.createElement("tr");
  newRow.innerHTML = `
        <td>${escapeHtml(client.nome)}</td>
        <td>${escapeHtml(client.email)}</td>
        <td>${escapeHtml(client.celular)}</td>
        <td>${escapeHtml(client.cidade)}</td>
        <td>${escapeHtml(client.estado ?? "")}</td>
        <td>
            <button type="button" class="button green" data-action="edit" data-id="${escapeHtml(String(client.id))}">Editar</button>
            <button type="button" class="button red" data-action="delete" data-id="${escapeHtml(String(client.id))}">Excluir</button>
        </td>
    `;
  document.querySelector("#tableClient>tbody").appendChild(newRow);
};

const clearTable = () => {
  const rows = document.querySelectorAll("#tableClient>tbody tr");
  rows.forEach((row) => row.parentNode.removeChild(row));
};

const updateSortIndicators = () => {
  document
    .querySelectorAll("#tableClient thead th[data-field]")
    .forEach((th) => {
      th.classList.toggle("sort-asc", th.dataset.field === sortField && sortAsc);
      th.classList.toggle(
        "sort-desc",
        th.dataset.field === sortField && !sortAsc,
      );
    });
};

const updatePagination = (totalPages) => {
  const pager = document.getElementById("paginacao");
  pager.hidden = totalPages <= 1;

  document.getElementById("paginaInfo").textContent =
    `Página ${currentPage} de ${totalPages}`;
  document.getElementById("paginaAnterior").disabled = currentPage === 1;
  document.getElementById("paginaProxima").disabled = currentPage === totalPages;
};

const updateRecordsInfo = (visible, total, term, totalPages) => {
  const info = document.getElementById("contador");
  const empty = document.getElementById("vazio");

  empty.hidden = visible > 0;

  if (total === 0) {
    info.textContent = "Nenhum cliente cadastrado.";
    empty.textContent =
      'Cadastre o primeiro cliente clicando em "Cadastrar Cliente".';
    updatePagination(1);
    return;
  }

  info.textContent = term
    ? `${visible} de ${total} cliente(s) encontrado(s).`
    : `${total} cliente(s) cadastrado(s).`;
  empty.textContent = "Nenhum cliente encontrado para a busca.";
  updatePagination(totalPages);
};

const renderTable = () => {
  const term = document.getElementById("busca").value.trim().toLowerCase();
  clearTable();

  const list = clientes.slice();

  if (sortField) {
    list.sort((a, b) => {
      const result = (a[sortField] ?? "").localeCompare(
        b[sortField] ?? "",
        "pt-BR",
      );
      return sortAsc ? result : -result;
    });
  }

  const visible = list.filter((client) => {
    const text =
      `${client.nome} ${client.email} ${client.celular} ${client.cidade} ${client.estado ?? ""}`.toLowerCase();
    return text.includes(term);
  });

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = visible.slice(start, start + PAGE_SIZE);

  updateSortIndicators();
  pageItems.forEach((client) => createRow(client));
  updateRecordsInfo(visible.length, clientes.length, term, totalPages);
};

// Exportação e backup

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

const exportCsv = () => {
  const rows = clientes.map((client) => [
    client.nome,
    client.email,
    client.celular,
    client.cidade,
    client.estado ?? "",
  ]);
  const csv = [CSV_HEADERS, ...rows]
    .map((row) =>
      row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";"),
    )
    .join("\r\n");
  downloadFile(`\uFEFF${csv}`, "clientes.csv", "text/csv;charset=utf-8;");
};

const exportBackup = () => {
  downloadFile(
    JSON.stringify(clientes, null, 2),
    "clientes-backup.json",
    "application/json",
  );
};

const normalizeClient = (client) => ({
  nome: String(client?.nome ?? "").trim(),
  email: String(client?.email ?? "").trim(),
  celular: String(client?.celular ?? "").trim(),
  cidade: String(client?.cidade ?? "").trim(),
  estado: String(client?.estado ?? "").trim().toUpperCase(),
});

const importBackup = (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch {
      alert("Arquivo inválido: não foi possível ler o JSON.");
      return;
    }

    if (!Array.isArray(data)) {
      alert("Arquivo inválido: o backup deve conter uma lista de clientes.");
      return;
    }

    const merged = clientes.slice();
    let imported = 0;
    let skipped = 0;

    for (const item of data) {
      const client = normalizeClient(item);
      if (!client.nome || !client.email) {
        skipped++;
        continue;
      }

      const duplicated = merged.some(
        (c) => c.email.toLowerCase() === client.email.toLowerCase(),
      );
      if (duplicated) {
        skipped++;
        continue;
      }

      try {
        await createClient(client);
        merged.push(client);
        imported++;
      } catch {
        skipped++;
      }
    }

    await refresh();
    alert(
      `Importação concluída: ${imported} cliente(s) adicionado(s), ${skipped} ignorado(s).`,
    );
  };

  reader.onerror = () => alert("Não foi possível ler o arquivo selecionado.");
  reader.readAsText(file);
};

// Edição e exclusão

const fillFields = (client) => {
  document.getElementById("nome").value = client.nome;
  document.getElementById("email").value = client.email;
  document.getElementById("celular").value = client.celular;
  document.getElementById("cidade").value = client.cidade;
  document.getElementById("estado").value = client.estado ?? "";
  document.getElementById("nome").dataset.id = client.id;
};

const editClient = (id) => {
  const client = clientes.find((c) => String(c.id) === String(id));
  if (!client) return;
  fillFields(client);
  document.getElementById("modalTitle").textContent = "Editar Cliente";
  openModal();
};

const editDelete = async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;

  if (action === "edit") {
    editClient(id);
    return;
  }

  const client = clientes.find((c) => String(c.id) === String(id));
  if (!client) return;

  const response = confirm(
    `Deseja realmente excluir o(a) cliente ${client.nome}?`,
  );
  if (!response) return;

  try {
    await removeClient(id);
  } catch (error) {
    alert(error.message);
    return;
  }

  await refresh();
};

const maskPhone = (event) => {
  let digits = event.target.value.replace(/\D/g, "").slice(0, 11);
  if (digits.length > 6) {
    digits = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  } else if (digits.length > 2) {
    digits = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  } else if (digits.length > 0) {
    digits = `(${digits}`;
  }
  event.target.value = digits;
};

// Eventos
document
  .getElementById("cadastrarCliente")
  .addEventListener("click", openModal);

document.getElementById("modalClose").addEventListener("click", closeModal);

document.getElementById("salvar").addEventListener("click", saveClient);

document
  .querySelector("#tableClient>tbody")
  .addEventListener("click", editDelete);

document.getElementById("cancelar").addEventListener("click", closeModal);

document.getElementById("busca").addEventListener("input", () => {
  currentPage = 1;
  renderTable();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

document.getElementById("celular").addEventListener("input", maskPhone);

document.getElementById("form").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveClient();
  }
});

document.getElementById("exportarCsv").addEventListener("click", exportCsv);

document.getElementById("exportarBackup").addEventListener("click", exportBackup);

document
  .getElementById("importarBackup")
  .addEventListener("click", () =>
    document.getElementById("arquivoBackup").click(),
  );

document
  .getElementById("arquivoBackup")
  .addEventListener("change", importBackup);

document.getElementById("paginaAnterior").addEventListener("click", () => {
  currentPage -= 1;
  renderTable();
});

document.getElementById("paginaProxima").addEventListener("click", () => {
  currentPage += 1;
  renderTable();
});

document
  .querySelector("#tableClient thead")
  .addEventListener("click", (event) => {
    const field = event.target.dataset.field;
    if (!field) return;
    sortAsc = sortField === field ? !sortAsc : true;
    sortField = field;
    currentPage = 1;
    renderTable();
  });

const init = async () => {
  await detectDataSource();
  await refresh();
};

init();
