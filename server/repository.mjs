export function ownerColumn(config) {
  return config.owner ?? "owner_id";
}

export class OwnedRecordsRepository {
  constructor(resources) {
    this.resources = resources;
  }

  async findAll(db, resource, ownerId) {
    const config = this.resources[resource];
    const source = config.source ?? resource;
    const [rows] = await db.execute(
      `SELECT ${config.columns ?? "*"} FROM \`${source}\`
       WHERE \`${ownerColumn(config)}\` = ? ${config.filter ?? ""}
       ORDER BY ${config.order}`,
      [ownerId],
    );
    return rows;
  }

  async findById(db, resource, ownerId, id) {
    const config = this.resources[resource];
    const source = config.source ?? resource;
    const [rows] = await db.execute(
      `SELECT ${config.columns ?? "*"} FROM \`${source}\`
       WHERE \`${ownerColumn(config)}\` = ? AND id = ? ${config.filter ?? ""}`,
      [ownerId, id],
    );
    return rows[0] ?? null;
  }
}
