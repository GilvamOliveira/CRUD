# Cadastro de Clientes (CRUD)

Aplicação web para **cadastrar, listar, editar e excluir clientes**, feita com HTML, CSS e JavaScript puro. Os dados ficam salvos no próprio navegador, usando `localStorage`.

🔗 **Demo online:** https://gilvamoliveira.github.io/CRUD/

![Tela do sistema](img/tela.png)

## Funcionalidades

- **Cadastrar, editar e excluir** clientes (nome, e-mail, celular, cidade e estado), com confirmação antes de excluir
- **Busca** em tempo real por nome, e-mail, celular, cidade ou estado, com contador de resultados
- **Ordenação** da tabela ao clicar no cabeçalho de cada coluna, com indicador visual de ordem crescente/decrescente
- **Máscara de celular** automática no formato `(11) 99999-8888`
- **Bloqueio de e-mail e celular duplicados**, sem diferenciar maiúsculas de minúsculas no e-mail
- **Exportação em CSV** de todos os clientes, pronta para abrir no Excel
- **Backup em JSON** para exportar e importar os cadastros em outro navegador ou computador
- **Importação segura**: valida o arquivo, ignora registros incompletos e não duplica e-mails
- **Estado vazio** com orientação quando não há clientes ou a busca não retorna resultados
- **Proteção contra XSS**: os dados digitados são tratados antes de serem exibidos na tabela
- **Modal de cadastro** que fecha com o botão Cancelar, com o ✖ ou com a tecla `Esc`, e salva com `Enter`
- **Layout responsivo** para desktop e celular

## Tecnologias

- HTML5
- CSS3
- JavaScript (ES6+), sem frameworks
- `localStorage` para persistência dos dados
- GitHub Pages para a publicação

## Estrutura do projeto

```
CRUD/
├── index.html
├── main.js
└── css/
    ├── main.css
    ├── button.css
    ├── records.css
    └── modal.css
```

## Como rodar

1. Clone o repositório:
   ```bash
   git clone https://github.com/GilvamOliveira/CRUD.git
   ```
2. Abra a pasta `CRUD` e dê dois cliques no `index.html` (ou abra o arquivo no navegador).

Não precisa instalar nada.

## Observações

Como os dados ficam no `localStorage`, eles pertencem ao navegador e ao computador em que foram cadastrados. Limpar os dados do navegador apaga os clientes. Por isso, use o **Exportar JSON** para manter um backup e o **Importar JSON** para restaurar os cadastros em outro navegador.

O **Exportar CSV** gera um arquivo com todos os clientes (não apenas os filtrados pela busca), usando `;` como separador e codificação UTF-8.

## Próximos passos

- Back-end com API REST e banco de dados, para substituir o `localStorage`
- Paginação para grandes volumes de clientes

## Créditos

Projeto desenvolvido durante o curso, a partir do layout base do Prof. Fernando Leonid.

Melhorias e correções feitas por mim: busca, ordenação por coluna, máscara de celular, campo de estado, bloqueio de e-mail duplicado, proteção contra XSS, correção de bugs no fluxo de edição, contador de resultados, estado vazio, exportação CSV, backup/importação JSON, bloqueio de celular duplicado e salvamento com `Enter`.

## Autor

**Gilvam Júnior Oliveira**

[LinkedIn](https://linkedin.com/in/gilvam-oliveira) · [GitHub](https://github.com/GilvamOliveira)
