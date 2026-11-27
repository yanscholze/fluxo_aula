# Fluxo Pessoal

Aplicação local baseada no esquema MySQL 8.4 fornecido com o projeto. O SQL principal cria sete tabelas. A interface permite criar uma conta de acesso, editar o perfil e gerenciar contas financeiras, categorias, cartões e lançamentos. Cada parcelamento é criado a partir de um lançamento e suas parcelas ficam agrupadas no extrato.

## Abrir para a apresentação

No terminal, na pasta do projeto, rode:

```bash
./APRESENTAR.sh
```

Abra [o Fluxo](http://127.0.0.1:5174) e entre com **demo@fluxo.local** e senha `FluxoDemo123!`. Para ver as consultas do [roteiro](docs/apresentacao.md), rode `./APRESENTAR.sh --sql` em outro terminal.

Neste computador, o atalho usa o MySQL local já preparado. Ele instala este esquema em `fluxo_pessoal_apresentacao`, separado das bases anteriores. Em outra máquina com Docker Compose, o mesmo comando prepara um volume novo. Para encerrar, use **Ctrl+C** no ambiente local ou `docker compose stop` com Docker.

## SQL em ordem

| Arquivo | O que faz |
| --- | --- |
| [01-banco.sql](database/01-banco.sql) | Instala o esquema enviado, com sete tabelas, índice, função, procedure, gatilho e visão. |
| [02-dados-demo.sql](database/02-dados-demo.sql) | Cria a conta fictícia e seus exemplos financeiros. |
| [03-consultas-demo.sql](database/03-consultas-demo.sql) | Demonstra as consultas, o índice, a transação e os requisitos da apresentação. |

Para criar um ambiente Docker vazio e cadastrar seu próprio usuário, rode `docker compose up --build`.

## Instalação manual

Use Node.js 22.22.2 ou superior, npm e uma instância MySQL 8.4 com o nome `fluxo_pessoal` disponível. Importe o esquema. Para usar a conta de apresentação, importe também o arquivo 02.

```bash
mysql -u root -p < database/01-banco.sql
mysql -u root -p < database/02-dados-demo.sql
```

No cliente MySQL, crie a conta de conexão da aplicação e escolha a senha:

```sql
CREATE USER IF NOT EXISTS 'fluxo'@'127.0.0.1' IDENTIFIED BY 'escolha_uma_senha';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON fluxo_pessoal.* TO 'fluxo'@'127.0.0.1';
```

Copie `.env.example` para `.env`, informe a senha em `DB_PASSWORD` e execute:

```bash
npm ci
npm run build
npm start
```

## Como funciona

A interface React chama a API Express, que usa [consultas parametrizadas](server/repository.mjs) via `mysql2`. O login verifica a senha armazenada em `users` e usa um cookie assinado para identificar o usuário. As contas, categorias, cartões e lançamentos pertencem ao usuário conectado. A visão `vw_lancamentos` fornece o extrato, a procedure grava transferências e `installment_groups` reúne lançamentos parcelados.

Veja as relações e as chaves na [modelagem](docs/modelagem.md).
