"use strict";

const openModal = () =>
  document.getElementById("modal").classList.add("active");

const closeModal = () =>
  document.getElementById("modal").classList.remove("active");

const tempClient = {
  nome: "Gilvam",
  email: "oliveiragilvam70@gmail.com",
  celular: "11934567890",
  cidade: "Guarulhos",
};

// CRUD -> Create, Read, Update and Delete

const createClient = (client) => {
    const db_client = JSON.parse(localStorage.getItem('db_client'))
    console.log(db_client)
    db_client.push (client)
    localStorage.setItem("db_client", JSON.stringify(db_client))
};

// Eventos

document.getElementById("cadastrarCliente").addEventListener("click", openModal);

document.getElementById("modalClose").addEventListener("click", closeModal);
