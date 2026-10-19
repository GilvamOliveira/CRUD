import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

const code = await readFile(
  new URL("../js/validacao.js", import.meta.url),
  "utf8",
);
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const { Validacao } = sandbox.window;

const validClient = {
  nome: "Ana Silva",
  email: "ana@example.com",
  celular: "(11) 99999-8888",
  cidade: "São Paulo",
  estado: "SP",
};

test("normaliza os campos do cliente", () => {
  const result = Validacao.normalizeClient({
    nome: "  Ana Silva  ",
    email: " ana@example.com ",
    celular: " (11) 99999-8888 ",
    cidade: " São Paulo ",
    estado: " sp ",
  });

  assert.equal(JSON.stringify(result), JSON.stringify(validClient));
});

test("aceita um cliente válido", () => {
  assert.equal(Object.keys(Validacao.validateClient(validClient)).length, 0);
});

test("rejeita campos vazios", () => {
  const fields = Validacao.validateClient({
    nome: "",
    email: "",
    celular: "",
    cidade: "",
    estado: "",
  });

  assert.deepEqual(Object.keys(fields).sort(), [
    "celular",
    "cidade",
    "email",
    "estado",
    "nome",
  ]);
});

test("rejeita formatos inválidos", () => {
  const fields = Validacao.validateClient({
    ...validClient,
    email: "ana@",
    celular: "11999998888",
    estado: "XX",
  });

  assert.equal(fields.email, "E-mail inválido.");
  assert.equal(fields.celular, "Use o formato (11) 99999-8888.");
  assert.equal(fields.estado, "Estado inválido.");
});

test("aplica a máscara de celular", () => {
  assert.equal(Validacao.maskPhone("11"), "(11");
  assert.equal(Validacao.maskPhone("119"), "(11) 9");
  assert.equal(Validacao.maskPhone("1199999"), "(11) 99999-");
  assert.equal(Validacao.maskPhone("11999998888"), "(11) 99999-8888");
  assert.equal(Validacao.maskPhone("119999988889999"), "(11) 99999-8888");
});
