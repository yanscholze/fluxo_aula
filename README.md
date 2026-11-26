# Fluxo Aula

Aplicação web de finanças pessoais para a disciplina de Banco de Dados. A interface React foi reaproveitada de `ui_fluxo` e os dados são persistidos no MySQL, a partir do MER simplificado.

## Abrir para a apresentação

Abra um terminal na pasta `fluxo_aula` e execute:

```bash
./APRESENTAR.sh
```

Abra [http://127.0.0.1:5174](http://127.0.0.1:5174) e entre com **demo@fluxo.local** e senha **FluxoDemo123!**. Com o Fluxo aberto, rode `./APRESENTAR.sh --sql` em outro terminal para executar as consultas do roteiro.

O atalho usa o MySQL e o Node.js locais quando o ambiente portátil já está preparado. Nesse modo, os dados ficam em `${XDG_DATA_HOME:-$HOME/.local/share}/fluxo-aula` e **Ctrl+C** encerra a aplicação e o banco do Fluxo. Em outro computador com Docker Compose, o mesmo comando prepara o ambiente em contêineres e importa a conta de demonstração. Use `docker compose stop` para parar os contêineres.

## Rodar com Docker

Pré-requisito: Docker com o plugin Docker Compose. No terminal, abra a pasta `fluxo_aula` e execute:

```bash
docker compose up --build
```

Quando o serviço indicar que o Fluxo está disponível, abra [http://127.0.0.1:5174](http://127.0.0.1:5174) e clique em **Criar uma conta**. O Compose prepara o MySQL e importa os scripts de estrutura na primeira inicialização do volume.

Para parar, use **Ctrl+C** no terminal ou `docker compose stop`. Os dados ficam no volume `fluxo-db`. Para mudar a porta publicada, defina `PORT` em um arquivo `.env` antes de subir o Compose.

### Abrir com dados de apresentação

Com o MySQL do Compose em execução, importe o perfil fictício uma vez:

```bash
docker compose exec -T db sh -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD"' < database/04-dados-de-apresentacao.sql
```

Entre com **demo@fluxo.local** e senha **FluxoDemo123!**. Para acompanhar os exemplos do roteiro, execute:

```bash
docker compose exec -T db sh -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD"' < database/05-consultas-de-apresentacao.sql
```

## Rodar com Node.js e MySQL instalados

Pré-requisitos: Node.js 22.22.2 ou superior, npm e MySQL 8.0 atualizado ou 8.4. Use uma base nova para a instalação da estrutura. No terminal aberto em `fluxo_aula`, importe os três arquivos em ordem:

```bash
mysql -u root -p < database/Fluxo-MER-simplificado-MySQL.sql
mysql -u root -p < database/02-referencias-de-contas.sql
mysql -u root -p < database/03-recursos-academicos.sql
```

Crie um usuário MySQL para a aplicação. Entre com `mysql -u root -p` e execute o SQL abaixo, substituindo a senha:

```sql
CREATE USER 'fluxo'@'127.0.0.1' IDENTIFIED BY 'escolha_uma_senha';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON fluxo_pessoal.* TO 'fluxo'@'127.0.0.1';
```

Copie a configuração, edite `DB_PASSWORD` e ajuste host, porta ou usuário conforme seu MySQL. Em seguida, instale, compile e inicie:

```bash
cp .env.example .env
npm ci
npm run build
npm start
```

Abra [http://127.0.0.1:5174](http://127.0.0.1:5174). Para carregar o perfil fictício, execute `mysql -u root -p < database/04-dados-de-apresentacao.sql`. As consultas do roteiro estão em `05-consultas-de-apresentacao.sql` e usam o mesmo comando de importação.

## Como usar

1. Cadastre uma conta e as categorias que deseja utilizar.
2. Registre receitas, despesas, transferências, estornos e pagamentos de fatura em **Lançamentos**. Informe o valor total ao parcelar uma despesa. O Fluxo distribui os centavos e registra cada parcela.
3. Cadastre cartões e confira as faturas por competência. Cadastre compromissos recorrentes e confirme o mês para efetivar o lançamento.
4. Vincule despesas a viagens, consulte pontos e cashback, revise capturas registradas e acompanhe os resumos no **Painel** e em **Relatórios**.

## Arquitetura e funcionamento

- `ui_fluxo/` guarda a interface React e o sistema visual. A interface faz requisições JSON à API no mesmo endereço.
- `server/index.mjs` serve a interface compilada e a API Express. `auth.mjs` valida o usuário e persiste as sessões. `finance.mjs` valida as operações e `repository.mjs` lê os registros do usuário com consultas parametrizadas via `mysql2`.
- `database/` contém o MER simplificado em SQL, o ajuste das seis referências de contas e a extensão acadêmica com normalização, visão, função, procedure, gatilhos, índice e auditoria. Os arquivos 04 e 05 são opcionais na instalação.
- Valores monetários são guardados em centavos. Uma transferência registra a conta de origem e a de destino na mesma linha e atualiza o saldo calculado de cada uma. O banco valida a operação e grava sua auditoria na mesma transação.
- Os dados financeiros de cada usuário ficam separados por titular. No painel, os totais em BRL usam lançamentos confirmados, enquanto os saldos individuais são exibidos na moeda de cada conta.

A sequência de demonstração e a conferência de cada requisito estão no [roteiro da apresentação](docs/apresentacao.md). O MER, as participações e o mapeamento de chaves estão na [modelagem do banco](docs/modelagem.md).
