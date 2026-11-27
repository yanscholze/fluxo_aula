# Roteiro da apresentação

Abra o Fluxo e entre com `demo@fluxo.local` e senha `FluxoDemo123!`. Os dados fictícios são preparados pelo script 02. [Como iniciar](../README.md) · [Dados de exemplo](../database/02-dados-demo.sql)

1. Mostre os cadastros de conta, categoria e cartão e a relação deles com os lançamentos. Abra a compra parcelada para mostrar duas linhas ligadas a um grupo. [Modelo](modelagem.md)
2. Em **Lançamentos**, transfira R$ 25,00 da **Conta corrente** para a **Reserva**. Mostre a saída na origem, a entrada no destino e a linha de transferência no extrato.
3. Execute `./APRESENTAR.sh --sql` em outro terminal. Demonstre o extrato, as despesas por categoria, o `EXPLAIN` e o `ALTER TABLE` da tabela temporária. [Consultas](../database/03-consultas-demo.sql)
4. Acompanhe a transferência SQL de R$ 25,00. O teste muda o valor para R$ 30,00, exclui a linha e executa `ROLLBACK`. O valor restaurado é R$ 25,00. No fim, o script remove os registros que criou para os testes. [Consultas](../database/03-consultas-demo.sql)

## Requisitos no código

| Requisito | O que mostrar |
| --- | --- |
| Modelo conceitual, relacional e 3FN | Mostre entidades, cardinalidades, participações, PKs, FKs e os exemplos de normalização. [Modelagem](modelagem.md) |
| DDL | Mostre `CREATE TABLE`, tipos, chaves, `NOT NULL`, `UNIQUE` e `CHECK`. O `ALTER TABLE` acrescenta uma coluna a uma tabela temporária que o próprio roteiro cria e remove. [Banco](../database/01-banco.sql) · [Consultas](../database/03-consultas-demo.sql) |
| DML | Mostre o povoamento com `INSERT`, o `UPDATE` e o `DELETE` com `WHERE`. As consultas usam filtro, ordenação, junção, subconsulta, `GROUP BY` e `HAVING`. [Povoamento](../database/02-dados-demo.sql) · [Consultas](../database/03-consultas-demo.sql) |
| View e função | A aplicação lê a `vw_lancamentos`. A visão busca a quantidade de parcelas e chama `fn_valor_movimento` para calcular o valor com sinal para a origem. [Banco](../database/01-banco.sql) |
| Procedure | A `sp_registrar_transferencia` valida o titular, as contas, a moeda e o valor. O `COMMIT` confirma a linha. Em caso de erro, o tratador executa `ROLLBACK`. [Banco](../database/01-banco.sql) |
| Trigger | `tr_usuarios_liberar_referencias` exclui os lançamentos e os cartões antes de excluir um usuário. O teste cria um usuário temporário com vínculos e confirma que as contagens ficam em zero após a exclusão. [Banco](../database/01-banco.sql) · [Consultas](../database/03-consultas-demo.sql) |
| Índice | O `idx_transactions_owner_data` começa com titular e exclusão lógica, os dois filtros de igualdade. As colunas seguintes seguem a ordem do extrato. Compare a coluna `key` e o `Using filesort` em `Extra`. [Consultas](../database/03-consultas-demo.sql) |
| Conexão da aplicação | Mostre a conexão `mysql2`, o filtro com o titular da sessão e os valores enviados como parâmetros numa consulta. [Servidor](../server/index.mjs) · [Repositório](../server/repository.mjs) |

## Álgebra relacional

As expressões correspondem às três primeiras consultas do script 03. Usam `σ` para seleção, `π` para projeção, `⋈` para junção, `⟕` para junção externa à esquerda, `γ` para agregação e `τ` para ordenação. A projeção preserva repetições, como no SQL sem `DISTINCT`. `u` é o ID do titular.

### 1. Extrato

```text
L ← σ[owner_id = u ∧ deleted_at IS NULL](vw_lancamentos)
E ← L ⟕[L.owner_id = O.owner_id ∧ L.account = O.id] O
E₂ ← E ⟕[L.owner_id = D.owner_id ∧ L.destination_account = D.id] D
E₃ ← E₂ ⟕[L.owner_id = C.owner_id ∧ L.category = C.id] C
Q₁ ← π[L.occurred_at, L.description, O.name → origem, D.name → destino,
        C.name → categoria, L.installments, L.valor_origem_centavos](
        τ[L.occurred_at DESC, L.created_at DESC, L.id DESC](E₃))
```

`O` e `D` são cópias renomeadas de `accounts`, e `C` é `categories`. As junções externas mantêm as linhas com origem, destino ou categoria vazios.

### 2. Despesas confirmadas por categoria

```text
X ← σ[owner_id = u ∧ type = 'expense' ∧ status = 'confirmed' ∧ deleted_at IS NULL](transactions)
G ← γ[C.id, C.name; COUNT(*) → quantidade, SUM(X.amount_cents) → total_centavos](
        X ⋈[X.owner_id = C.owner_id ∧ X.category = C.id] C)
Q₂ ← π[C.name → categoria, quantidade, total_centavos](
        τ[total_centavos DESC](σ[quantidade ≥ 2](G)))
```

Filtre as despesas, recupere o nome da categoria e calcule o total e a quantidade por grupo. O filtro da quantidade opera depois do agrupamento e corresponde a `HAVING COUNT(*) >= 2`.

### 3. Despesas confirmadas acima da média

```text
M ← γ[AVG(amount_cents) → media](X)
Q₃ ← π[description, amount_cents](
        τ[amount_cents DESC](σ[amount_cents > media](X × M)))
```

`M` representa o valor da subconsulta. Compare cada despesa de `X` com a média antes de ordenar.

## Transação e ACID

- **Atomicidade.** A transferência é confirmada como uma unidade. O exemplo de `ROLLBACK` desfaz juntos o `UPDATE` e o `DELETE` de teste.
- **Consistência.** As chaves estrangeiras mantêm os vínculos no mesmo titular. A procedure exige contas diferentes, moeda igual e valor positivo.
- **Isolamento.** O `SELECT ... FOR UPDATE` bloqueia as linhas do usuário e das contas durante a conferência da transferência.
- **Durabilidade.** O `COMMIT` torna o lançamento persistente no MySQL. O teste consegue reler a linha confirmada quando reverte uma transação posterior.

Execute o `CALL` com a sessão fora de uma transação aberta, pois a procedure inicia e encerra a própria transação.
