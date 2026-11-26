#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

runtime="${XDG_DATA_HOME:-$HOME/.local/share}/fluxo-aula"
port="${PORT:-5174}"

if [[ $# -gt 1 || ( $# -eq 1 && "$1" != "--sql" ) ]]; then
  echo "Uso: ./APRESENTAR.sh [--sql]" >&2
  exit 2
fi

if [[ -f "$runtime/mysql-client.cnf" && -x "$runtime/bin/node" ]]; then
  mysql_path="$runtime/mysql/usr"
  mysql_local() {
    LD_LIBRARY_PATH="$mysql_path/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
      "$mysql_path/bin/mysql" --defaults-file="$runtime/mysql-client.cnf" "$@"
  }

  if [[ "${1:-}" == "--sql" ]]; then
    if ! mysql_local --batch --execute='SELECT 1' >/dev/null 2>&1; then
      echo "Inicie ./APRESENTAR.sh em outro terminal antes de executar as consultas." >&2
      exit 1
    fi
    mysql_local --table < database/05-consultas-de-apresentacao.sql
    exit
  fi

  exec 9>"$runtime/start.lock"
  if ! flock -n 9; then
    echo "Já existe uma instância do Fluxo em execução. Abra http://127.0.0.1:$port." >&2
    exit 1
  fi

  export PATH="$runtime/bin:$PATH"
  if [[ ! -x node_modules/.bin/vite ]]; then npm ci; fi
  npm run build

  app_pid=""
  mysql_pid=""
  cleanup() {
    if [[ -n "$app_pid" ]]; then
      kill "$app_pid" 2>/dev/null || true
      wait "$app_pid" 2>/dev/null || true
    fi
    if [[ -n "$mysql_pid" ]]; then
      mysql_local --execute='SHUTDOWN' >/dev/null 2>&1 || kill "$mysql_pid" 2>/dev/null || true
      wait "$mysql_pid" 2>/dev/null || true
    fi
  }
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  LD_LIBRARY_PATH="$mysql_path/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
    "$mysql_path/sbin/mysqld" --defaults-file="$runtime/mysql-server.cnf" &
  mysql_pid=$!
  ready=0
  for ((attempt=0; attempt<100; attempt++)); do
    if mysql_local --batch --execute='SELECT 1' >/dev/null 2>&1; then
      ready=1
      break
    fi
    if ! kill -0 "$mysql_pid" 2>/dev/null; then break; fi
    sleep 0.2
  done
  if [[ "$ready" != 1 ]]; then
    echo "O MySQL não iniciou. Consulte $runtime/mysql.log." >&2
    exit 1
  fi

  HOST=127.0.0.1 PORT="$port" DB_HOST=127.0.0.1 DB_PORT=33307 DB_USER=fluxo \
    DB_PASSWORD="$(< "$runtime/app-password")" node server/index.mjs &
  app_pid=$!
  wait "$app_pid"
  exit
fi

if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  docker_sql() {
    docker compose exec -T db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$@"' mysql "$@"
  }
  if [[ "${1:-}" == "--sql" ]]; then
    docker_sql --table < database/05-consultas-de-apresentacao.sql
    exit
  fi

  docker compose up -d --build --wait
  demo=$(docker_sql --batch --skip-column-names --execute="SELECT 1 FROM fluxo_pessoal.users WHERE id = 'fluxo-aula-demo' AND email = 'demo@fluxo.local'")
  if [[ "$demo" != 1 ]]; then
    docker_sql < database/04-dados-de-apresentacao.sql
  fi
  address=$(docker compose port app 5174)
  echo "Fluxo disponível em http://$address."
  echo 'Apresentação: demo@fluxo.local / FluxoDemo123!'
  exit
fi

echo "Instale o Docker Compose ou siga a instalação com Node.js e MySQL no README." >&2
exit 1
