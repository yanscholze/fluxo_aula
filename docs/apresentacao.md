# Roteiro da apresentação

Inicie o Fluxo com `./APRESENTAR.sh` conforme o [README](../README.md). Com o aplicativo aberto, execute `./APRESENTAR.sh --sql` em outro terminal. Para rodar os exemplos um a um, abra o arquivo [05-consultas-de-apresentacao.sql](../database/05-consultas-de-apresentacao.sql) em um cliente MySQL com a base `fluxo_pessoal`.

## Sequência para demonstrar

1. Entre com o perfil de apresentação. Mostre as contas e categorias vinculadas ao usuário no [MER e modelo relacional](modelagem.md).
2. Abra **Lançamentos** e cadastre uma transferência entre a Conta principal e a Reserva de emergência. Mostre a alteração dos dois saldos na tela **Contas**. Localize o lançamento e sua auditoria no MySQL.
3. Mostre o caminho da operação no código. O formulário envia JSON ao Express, que autentica a sessão e chama `sp_registrar_transferencia` com parâmetros. A listagem passa pelo repositório e consulta `vw_lancamentos`.
4. Rode as consultas de demonstração. Explique a consulta de despesas por categoria em álgebra relacional. Compare os dois planos do extrato e mostre o estado do lançamento e do histórico antes e depois do rollback.
5. Volte à interface e mostre um parcelamento, um compromisso ou a persistência dos dados após recarregar a página.

## Conferência dos requisitos

| Requisito | Onde está | O que explicar |
| --- | --- | --- |
| Modelagem conceitual | [MER](modelagem.md) | Usuário e conta formam uma relação 1:N. Conta e categoria se relacionam N:M pelos lançamentos categorizados. Mostre quem pode existir sem lançamentos e quais vínculos podem ser vazios. |
| Modelo relacional | [Tabela de PKs e FKs](modelagem.md) | `transactions.account` e `transactions.category` referenciam as respectivas entidades com o titular na chave composta. `transactions.destination_account` representa o destino de uma transferência. |
| Normalização até 3FN | [Arquivo 03](../database/03-recursos-academicos.sql) | O nome, a competência do lote e a data da importação dependem do lote. O total de parcelas depende do grupo. As tabelas `import_batches` e `installment_groups` evitam alterar a mesma informação em cada lançamento. |
| Três consultas em álgebra | [Representações abaixo](#álgebra-relacional) | Na consulta 2, filtre despesas confirmadas, faça a junção com as categorias e compare o total calculado com o limite de R$ 100,00. |
| DDL | [Esquema simplificado](../database/Fluxo-MER-simplificado-MySQL.sql), [arquivo 02](../database/02-referencias-de-contas.sql) e [arquivo 03](../database/03-recursos-academicos.sql) | Mostre os tipos `VARCHAR(64)`, `DATETIME` e `BIGINT`, PKs e FKs, `NOT NULL`, e-mail `UNIQUE`, os `ALTER TABLE` e o `CHECK` de valor positivo. |
| DML | [Arquivo 04](../database/04-dados-de-apresentacao.sql) e [arquivo 05](../database/05-consultas-de-apresentacao.sql) | Mostre os `INSERT` do povoamento, o `UPDATE` e o `DELETE` com `WHERE` em dados temporários e consultas com filtro, ordenação, junção, subconsulta, `GROUP BY` e `HAVING`. |
| View | `vw_lancamentos` no [arquivo 03](../database/03-recursos-academicos.sql) | Mostre o `LEFT JOIN` com o grupo para recuperar a quantidade de parcelas, o cálculo do valor assinado e a leitura dessa visão pela aplicação. |
| Função e procedure | `fn_valor_movimento` e `sp_registrar_transferencia` no [arquivo 03](../database/03-recursos-academicos.sql) | A função devolve um valor positivo para receitas e estornos e negativo para saídas. A procedure valida as contas e a moeda, grava a transferência e encerra a transação. |
| Trigger | `tr_lancamentos_audit_insert` e `tr_lancamentos_audit_update` no [arquivo 03](../database/03-recursos-academicos.sql) | Mostre como inserções e alterações geram histórico com os valores do lançamento. A exclusão pela interface marca `deleted_at` e também gera auditoria de atualização. |
| Índice | `idx_transactions_owner_data` no [arquivo 03](../database/03-recursos-academicos.sql) e `EXPLAIN` no [arquivo 05](../database/05-consultas-de-apresentacao.sql) | A chave começa por titular e exclusão lógica, filtros de igualdade. Os campos seguintes atendem à ordenação do extrato. Compare a coluna `key` e observe `Using filesort` quando a consulta ignora o índice. |
| Transação | `sp_registrar_transferencia` e exemplos no [arquivo 05](../database/05-consultas-de-apresentacao.sql) | Identifique `START TRANSACTION`, `COMMIT` e o `ROLLBACK` do tratador de erros. Mostre a alteração temporária desfeita junto com sua auditoria. |
| Conexão aplicação–BD | [Inicialização do servidor](../server/index.mjs), [repositório](../server/repository.mjs) e [operações financeiras](../server/finance.mjs) | O pool MySQL é compartilhado. O repositório usa `execute(sql, [ownerId, id])` com parâmetros separados do SQL. Mostre como a sessão fornece o titular usado nas consultas. |

## Álgebra relacional

As três expressões correspondem aos primeiros `SELECT` do arquivo 05. Usam álgebra relacional estendida, com projeção em multiconjuntos como o SQL sem `DISTINCT`, `σ` para seleção, `π` para projeção, `⋈` para junção, `γ` para agregação e `τ` para ordem de apresentação. `u` representa o usuário de apresentação, `m` o primeiro dia da competência do extrato e `m₊` o primeiro dia da competência seguinte.

### 1. Extrato de uma competência

```text
E ← σ[owner_id = u ∧ deleted_at IS NULL ∧ m ≤ occurred_at < m₊](vw_lancamentos)

Q₁ ← π[description, occurred_at, type, amount_cents, installments, valor_origem_centavos](
        τ[occurred_at DESC, id DESC](E)
      )
```

### 2. Despesas confirmadas por categoria

```text
D ← σ[owner_id = u ∧ type = 'expense' ∧ status = 'confirmed' ∧ deleted_at IS NULL](transactions)

C ← D ⋈[D.owner_id = categories.owner_id ∧ D.category = categories.id] categories

G ← γ[categories.id, categories.name;
       COUNT(*) → lancamentos, SUM(D.amount_cents) → total_centavos](C)

Q₂ ← π[name → categoria, lancamentos, total_centavos](
        τ[total_centavos DESC, name ASC](σ[total_centavos ≥ 10000](G))
      )
```

Na apresentação, siga a ordem de `D`, `C`, `G` e `Q₂`. O filtro inicial elimina lançamentos de outros titulares, despesas planejadas e registros excluídos. A junção identifica a categoria pelo titular e ID. O agrupamento por ID mantém categorias homônimas separadas. O segundo filtro opera sobre a soma já calculada, por isso corresponde ao `HAVING`.

### 3. Despesas acima da média

```text
M ← γ[AVG(amount_cents) → media](D)

Q₃ ← π[description, occurred_at, amount_cents](
        τ[amount_cents DESC, occurred_at DESC](σ[amount_cents > media](D × M))
      )
```

A média vem do mesmo conjunto de despesas confirmadas do usuário. O produto com a relação de um valor representa a comparação de cada despesa com o resultado da subconsulta.

## ACID no Fluxo

- **Atomicidade.** O registro da transferência e o evento do gatilho fazem parte da mesma unidade. O exemplo de rollback desfaz tanto a alteração do valor quanto seu evento de auditoria.
- **Consistência.** A transação respeita chaves estrangeiras e valor positivo. A procedure também exige duas contas do mesmo titular, distintas e com a mesma moeda.
- **Isolamento.** `SELECT … FOR UPDATE` bloqueia a linha do usuário durante a transferência e serializa as escritas financeiras feitas pela API para aquele titular.
- **Durabilidade.** Depois do `COMMIT`, o lançamento e sua auditoria estão no MySQL. Recarregar a interface ou reiniciar o aplicativo preserva os dados.

Execute a procedure por `CALL` fora de uma transação já aberta na sessão do cliente SQL. O controle da transação da transferência está na própria procedure.
