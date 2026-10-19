"use strict";

let sortField = null;
let sortAsc = true;

const CSV_HEADERS = ["Nome", "E-mail", "Celular", "Cidade", "Estado"];

const openModal = () => {
  document.getElementById("modal").classList.add("active");
  document.getElementById("nome").focus();
};

const closeModal = () => {
  clearFields();
  document.getElementById("nome").dataset.index = "new";
  document.getElementById("modalTitle").textContent = "Novo Cliente";
  document.getElementById("modal").classList.remove("active");
};

const getLocalStorage = () =>
  JSON.parse(localStorage.getItem("db_client")) ?? [];
const setLocalStorage = (dbClient) =>
  localStorage.setItem("db_client", JSON.stringify(dbClient));

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
  const rows = readClient().map((client) => [
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
    JSON.stringify(readClient(), null, 2),
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

  reader.onload = () => {
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

    const dbClient = readClient();
    let imported = 0;
    let skipped = 0;

    data.forEach((item) => {
      const client = normalizeClient(item);
      if (!client.nome || !client.email) {
        skipped++;
        return;
      }

      const duplicated = dbClient.some(
        (c) => c.email.toLowerCase() === client.email.toLowerCase(),
      );
      if (duplicated) {
        skipped++;
        return;
      }

      dbClient.push(client);
      imported++;
    });

    setLocalStorage(dbClient);
    updateTable();
    alert(
      `Importação concluída: ${imported} cliente(s) adicionado(s), ${skipped} ignorado(s).`,
    );
  };

  reader.onerror = () => alert("Não foi possível ler o arquivo selecionado.");
  reader.readAsText(file);
};

// CRUD -> Create, Read, Update and Delete

const deleteClient = (index) => {
  const dbClient = readClient();
  dbClient.splice(index, 1);
  setLocalStorage(dbClient);
};

const updateClient = (index, client) => {
  const dbClient = readClient();
  dbClient[index] = client;
  setLocalStorage(dbClient);
};

const readClient = () => getLocalStorage();

const createClient = (client) => {
  const dbClient = getLocalStorage();
  dbClient.push(client);
  setLocalStorage(dbClient);
};

// Interação com o layout

const clearFields = () => {
  const fields = document.querySelectorAll("#form .modal-field");
  fields.forEach((field) => (field.value = ""));
};

const isValidFields = () => {
  return document.getElementById("form").reportValidity();
};

const saveClient = () => {
  if (isValidFields()) {
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

    const index = document.getElementById("nome").dataset.index;
    const dbClient = readClient();

    const emailExists = dbClient.some(
      (c, i) =>
        c.email.toLowerCase() === client.email.toLowerCase() &&
        String(i) !== index,
    );
    if (emailExists) {
      alert("Já existe um cliente com esse e-mail.");
      return;
    }

    const phoneExists = dbClient.some(
      (c, i) => c.celular === client.celular && String(i) !== index,
    );
    if (phoneExists) {
      alert("Já existe um cliente com esse celular.");
      return;
    }

    if (index == "new") {
      createClient(client);
      updateTable();
      closeModal();
    } else {
      updateClient(index, client);
      updateTable();
      closeModal();
    }
  }
};

const escapeHtml = (text) => {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
};

const createRow = (client, index) => {
  const newRow = document.createElement("tr");
  newRow.innerHTML = `
        <td>${escapeHtml(client.nome)}</td>
        <td>${escapeHtml(client.email)}</td>
        <td>${escapeHtml(client.celular)}</td>
        <td>${escapeHtml(client.cidade)}</td>
        <td>${escapeHtml(client.estado ?? "")}</td>
        <td>
            <button type="button" class="button green" id="edit-${index}">Editar</button>
            <button type="button" class="button red" id="delete-${index}">Excluir</button>
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
      th.classList.toggle(
        "sort-asc",
        th.dataset.field === sortField && sortAsc,
      );
      th.classList.toggle(
        "sort-desc",
        th.dataset.field === sortField && !sortAsc,
      );
    });
};

const updateRecordsInfo = (visible, total, term) => {
  const info = document.getElementById("contador");
  const empty = document.getElementById("vazio");

  empty.hidden = visible > 0;

  if (total === 0) {
    info.textContent = "Nenhum cliente cadastrado.";
    empty.textContent =
      'Cadastre o primeiro cliente clicando em "Cadastrar Cliente".';
    return;
  }

  info.textContent = term
    ? `${visible} de ${total} cliente(s) encontrado(s).`
    : `${total} cliente(s) cadastrado(s).`;
  empty.textContent = "Nenhum cliente encontrado para a busca.";
};

const updateTable = () => {
  const term = document.getElementById("busca").value.trim().toLowerCase();
  clearTable();

  const list = readClient().map((client, index) => ({ client, index }));

  if (sortField) {
    list.sort((a, b) => {
      const result = (a.client[sortField] ?? "").localeCompare(
        b.client[sortField] ?? "",
        "pt-BR",
      );
      return sortAsc ? result : -result;
    });
  }

  updateSortIndicators();

  const visible = list.filter(({ client }) => {
    const text =
      `${client.nome} ${client.email} ${client.celular} ${client.cidade} ${client.estado ?? ""}`.toLowerCase();
    return text.includes(term);
  });

  visible.forEach(({ client, index }) => createRow(client, index));
  updateRecordsInfo(visible.length, list.length, term);
};

const fillFields = (client) => {
  document.getElementById("nome").value = client.nome;
  document.getElementById("email").value = client.email;
  document.getElementById("celular").value = client.celular;
  document.getElementById("cidade").value = client.cidade;
  document.getElementById("estado").value = client.estado ?? "";
  document.getElementById("nome").dataset.index = client.index;
};

const editClient = (index) => {
  const client = readClient()[index];
  client.index = index;
  fillFields(client);
  document.getElementById("modalTitle").textContent = "Editar Cliente";
  openModal();
};

const editDelete = (event) => {
  if (event.target.type == "button") {
    const [action, index] = event.target.id.split("-");

    if (action == "edit") {
      editClient(index);
    } else {
      const client = readClient()[index];
      const response = confirm(
        `Deseja realmente excluir o(a) cliente ${client.nome}?`,
      );
      if (response) {
        deleteClient(index);
        updateTable();
      }
    }
  }
};

updateTable();

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

document.getElementById("busca").addEventListener("input", updateTable);

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
  .addEventListener("click", () => document.getElementById("arquivoBackup").click());

document
  .getElementById("arquivoBackup")
  .addEventListener("change", importBackup);

document
  .querySelector("#tableClient thead")
  .addEventListener("click", (event) => {
    const field = event.target.dataset.field;
    if (!field) return;
    sortAsc = sortField === field ? !sortAsc : true;
    sortField = field;
    updateTable();
  });
