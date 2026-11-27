import { randomUUID } from "node:crypto";

export const resources = {
  accounts: { order: "name, id", updated: true },
  categories: { order: "kind, name, id" },
  cards: { order: "is_favorite DESC, sort_order, name, id", updated: true },
  transactions: {
    source: "vw_lancamentos",
    filter: " AND deleted_at IS NULL",
    order: "occurred_at DESC, created_at DESC, id DESC",
    updated: true,
  },
  installment_groups: { order: "created_at DESC, id DESC" },
};

const financialNumbers = [
  "balance_cents", "goal_cents", "limit_cents", "manual_usd_rate_micros", "points_per_dollar_milli",
  "amount_cents", "reward_points_milli", "reward_cashback_cents", "reward_usd_rate_micros",
  "valor_origem_centavos",
];

function serialize(row) {
  if (!row) return null;
  const record = { ...row, id: String(row.id) };
  for (const field of financialNumbers) {
    const value = record[field];
    if (typeof value === "string" && Number.isSafeInteger(Number(value))) {
      record[field] = Number(value);
    }
  }
  return record;
}

function column(name) {
  return `\`${name}\``;
}

export function repository(db, ownerId) {
  async function find(resource, id) {
    const { source = resource, filter = "" } = resources[resource];
    const [[row]] = await db.execute(
      `SELECT * FROM ${column(source)} WHERE owner_id = ? AND id = ?${filter}`,
      [ownerId, id],
    );
    return serialize(row);
  }

  return {
    find,

    async list(resource) {
      const { source = resource, filter = "", order } = resources[resource];
      const [rows] = await db.execute(
        `SELECT * FROM ${column(source)} WHERE owner_id = ?${filter} ORDER BY ${order}`,
        [ownerId],
      );
      return rows.map(serialize);
    },

    async insert(resource, data, id = randomUUID()) {
      const record = { id, owner_id: ownerId, ...data };
      const keys = Object.keys(record);
      const marks = keys.map(() => "?").join(", ");
      await db.execute(
        `INSERT INTO ${column(resource)} (${keys.map(column).join(", ")}) VALUES (${marks})`,
        Object.values(record),
      );
      return id;
    },

    async update(resource, id, data) {
      const { updated, filter = "" } = resources[resource];
      const entries = Object.entries(data);
      const assignments = entries.map(([key]) => `${column(key)} = ?`);
      if (updated) assignments.push("updated_at = CURRENT_TIMESTAMP");
      if (resource === "transactions") assignments.push("version = COALESCE(version, 0) + 1");
      if (!assignments.length) return;
      await db.execute(
        `UPDATE ${column(resource)} SET ${assignments.join(", ")} WHERE owner_id = ? AND id = ?${filter}`,
        [...entries.map(([, value]) => value), ownerId, id],
      );
    },

    async remove(resource, id) {
      const [result] = resource === "transactions"
        ? await db.execute(
          "UPDATE transactions SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = COALESCE(version, 0) + 1 WHERE owner_id = ? AND id = ? AND deleted_at IS NULL",
          [ownerId, id],
        )
        : await db.execute(
          `DELETE FROM ${column(resource)} WHERE owner_id = ? AND id = ?`,
          [ownerId, id],
        );
      return result.affectedRows > 0;
    },

    async hasReference(resource, field, id) {
      const [[row]] = await db.execute(
        `SELECT 1 FROM ${column(resource)} WHERE owner_id = ? AND ${column(field)} = ? LIMIT 1`,
        [ownerId, id],
      );
      return Boolean(row);
    },

    async transfer(data) {
      const id = randomUUID();
      await db.execute("CALL sp_registrar_transferencia(?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        ownerId, id, data.description, data.account ?? null, data.destination_account ?? null,
        data.occurred_at, data.amount_cents, data.status, data.payment_method ?? null,
      ]);
      return find("transactions", id);
    },
  };
}
