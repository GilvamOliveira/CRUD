"use strict";

const openModal = () =>
  document.getElementById("modal").classList.add("active");

const closeModal = () => {
  clearFields();
  document.getElementById("nome").dataset.index = "new";
  document.querySelector(".modal-header h2").textContent = "Novo Cliente";
  document.getElementById("modal").classList.remove("active");
};

const getLocalStorage = () =>
  JSON.parse(localStorage.getItem("db_client")) ?? [];
const setLocalStorage = (dbClient) =>
  localStorage.setItem("db_client", JSON.stringify(dbClient));

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
  const fields = document.querySelectorAll(".modal-field");
  fields.forEach((field) => (field.value = ""));
};

const isValidFields = () => {
  return document.getElementById("form").reportValidity();
};

const saveClient = () => {
  if (isValidFields()) {
    const client = {
      nome: document.getElementById("nome").value,
      email: document.getElementById("email").value,
      celular: document.getElementById("celular").value,
      cidade: document.getElementById("cidade").value,
    };
    const index = document.getElementById("nome").dataset.index;

    const emailExists = readClient().some(
      (c, i) =>
        c.email.toLowerCase() === client.email.toLowerCase() &&
        String(i) !== index,
    );
    if (emailExists) {
      alert("Já existe um cliente com esse e-mail.");
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

const updateTable = () => {
  const term = document.getElementById("busca").value.toLowerCase();
  clearTable();
  readClient().forEach((client, index) => {
    const text =
      `${client.nome} ${client.email} ${client.celular} ${client.cidade}`.toLowerCase();
    if (text.includes(term)) createRow(client, index);
  });
};

const fillFields = (client) => {
  document.getElementById("nome").value = client.nome;
  document.getElementById("email").value = client.email;
  document.getElementById("celular").value = client.celular;
  document.getElementById("cidade").value = client.cidade;
  document.getElementById("nome").dataset.index = client.index;
};

const editClient = (index) => {
  const client = readClient()[index];
  client.index = index;
  fillFields(client);
  document.querySelector(".modal-header h2").textContent = "Editar Cliente";
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
