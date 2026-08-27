#!/bin/sh
set -eu

remote_host=${MS_REALTY_HERMES_SSH_HOST:-}
if [ -n "$remote_host" ]; then
  case "$remote_host" in
    *[!A-Za-z0-9._@:-]*) echo "MS_REALTY_HERMES_SSH_HOST contains unsupported characters" >&2; exit 64 ;;
  esac
  container=${MS_REALTY_HERMES_CONTAINER:-ms-realty-production-review-app-1}
  case "$container" in
    ""|*[!A-Za-z0-9_.-]*) echo "MS_REALTY_HERMES_CONTAINER contains unsupported characters" >&2; exit 64 ;;
  esac
  set -- -T -o BatchMode=yes -o StrictHostKeyChecking=yes
  identity=${MS_REALTY_HERMES_SSH_IDENTITY:-}
  if [ -n "$identity" ]; then
    case "$identity" in
      /*) ;;
      *) echo "MS_REALTY_HERMES_SSH_IDENTITY must be an absolute path" >&2; exit 64 ;;
    esac
    test -f "$identity" || { echo "MS Realty Hermes SSH identity not found" >&2; exit 66; }
    set -- "$@" -o IdentitiesOnly=yes -i "$identity"
  fi
  exec ssh "$@" "$remote_host" docker exec -i "$container" node production/scripts/hermes-mcp-server.mjs
fi

repo_root=${MS_REALTY_REPO_ROOT:-/Users/ivan/Code/MS-Realty}
case "$repo_root" in
  /*) ;;
  *) echo "MS_REALTY_REPO_ROOT must be an absolute path" >&2; exit 64 ;;
esac

server="$repo_root/production/scripts/hermes-mcp-server.mjs"
if [ ! -f "$server" ]; then
  echo "MS Realty Hermes MCP server not found at $server" >&2
  exit 66
fi
exec node "$server"
