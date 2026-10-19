"use strict";

(function () {
  const ESTADOS = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
    "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
    "SP", "SE", "TO",
  ];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_RE = /^\(\d{2}\) \d{5}-\d{4}$/;

  const normalizeClient = (client) => ({
    nome: String(client?.nome ?? "").trim(),
    email: String(client?.email ?? "").trim(),
    celular: String(client?.celular ?? "").trim(),
    cidade: String(client?.cidade ?? "").trim(),
    estado: String(client?.estado ?? "").trim().toUpperCase(),
  });

  const validateClient = (client) => {
    const fields = {};

    if (!client.nome) fields.nome = "Informe o nome.";
    else if (client.nome.length > 120) fields.nome = "Máximo de 120 caracteres.";

    if (!client.email) fields.email = "Informe o e-mail.";
    else if (!EMAIL_RE.test(client.email)) fields.email = "E-mail inválido.";

    if (!client.celular) fields.celular = "Informe o celular.";
    else if (!PHONE_RE.test(client.celular)) {
      fields.celular = "Use o formato (11) 99999-8888.";
    }

    if (!client.cidade) fields.cidade = "Informe a cidade.";
    else if (client.cidade.length > 120) {
      fields.cidade = "Máximo de 120 caracteres.";
    }

    if (!client.estado) fields.estado = "Selecione o estado.";
    else if (!ESTADOS.includes(client.estado)) fields.estado = "Estado inválido.";

    return fields;
  };

  const maskPhone = (value) => {
    let digits = String(value).replace(/\D/g, "").slice(0, 11);
    if (digits.length > 6) {
      digits = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    } else if (digits.length > 2) {
      digits = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    } else if (digits.length > 0) {
      digits = `(${digits}`;
    }
    return digits;
  };

  const escapeHtml = (text) => {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  };

  window.Validacao = {
    ESTADOS,
    EMAIL_RE,
    PHONE_RE,
    normalizeClient,
    validateClient,
    maskPhone,
    escapeHtml,
  };
})();
