#!/usr/bin/env bash
set -euo pipefail

release_id="${1:-}"
if [[ ! "$release_id" =~ ^[0-9a-f]{40}$ ]]; then
  echo "release id must be a full lowercase Git SHA" >&2
  exit 2
fi

base=/opt/ms-realty
releases="$base/releases"
archive="$base/incoming/$release_id.tar.gz"
release="$releases/$release_id"
env_file="$base/shared/.env.production-review"
current="$base/current"

test -f "$archive"
test -f "$env_file"
install -d -m 0700 "$base/incoming" "$releases"

if tar -tzf "$archive" | awk '/(^\/|(^|\/)\.\.(\/|$))/ { unsafe = 1 } END { exit unsafe ? 0 : 1 }'; then
  echo "release archive contains an unsafe path" >&2
  exit 2
fi

if [[ -e "$release" ]]; then
  test "$(<"$release/.ms-realty-release-sha")" = "$release_id"
else
  staging="$releases/.staging-$release_id"
  test ! -e "$staging"
  install -d -m 0755 "$staging"
  tar -xzf "$archive" -C "$staging"
  test -f "$staging/package.json"
  test -f "$staging/production/docker-compose.production-review.yml"
  printf '%s\n' "$release_id" > "$staging/.ms-realty-release-sha"
  mv "$staging" "$release"
fi
ln -sfn "$env_file" "$release/.env.production-review"

previous="$(readlink -f "$current" 2>/dev/null || true)"
if [[ -n "$previous" && "$previous" != "$releases/"* ]]; then
  echo "current release is outside $releases" >&2
  exit 2
fi

activate() {
  local target="$1"
  ln -s "$target" "$base/.current-$release_id"
  mv -Tf "$base/.current-$release_id" "$current"
}

run_stack() {
  local target="$1"
  local command="$2"
  local marker="$3"
  (
    cd "$target"
    MS_REALTY_ENV_FILE="$env_file" \
      MS_REALTY_COMPOSE_OVERRIDE=production/docker-compose.production-review.yml \
      MS_REALTY_BUILD_MARKER="$marker" \
      npm run "$command"
  )
}

switched=false
rollback() {
  local status="${1:-1}"
  trap - ERR
  set +e
  if [[ "$switched" == true && -n "$previous" ]]; then
    echo "deployment failed; restoring $previous" >&2
    if activate "$previous"; then
      run_stack "$previous" docker:up "$(basename "$previous")" || true
    else
      echo "deployment rollback failed to restore the previous release pointer" >&2
    fi
  fi
  exit "$status"
}
trap 'rollback "$?"' ERR

run_stack "$release" docker:status "$release_id"

if [[ -n "$previous" && "$previous" != "$release" ]]; then
  run_stack "$previous" docker:backup "$(basename "$previous")"
fi

activate "$release"
switched=true
run_stack "$release" docker:hermes:up "$release_id"

health_file="$(mktemp)"
trap 'rm -f "$health_file"' EXIT
healthy=false
for _ in $(seq 1 60); do
  if curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3200/api/health > "$health_file" &&
    node -e 'const d=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); if (d.service !== "ms-realty" || d.status !== "ok" || d.build_marker !== process.argv[2]) process.exit(1)' "$health_file" "$release_id"; then
    healthy=true
    break
  fi
  sleep 2
done
test "$healthy" = true

read_env() {
  awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$env_file"
}
origin_token="$(read_env MS_REALTY_ORIGIN_TOKEN)"
review_host="$(read_env MS_REALTY_REVIEW_HOST)"
test "${#origin_token}" -ge 32
[[ "$review_host" =~ ^[a-z0-9.-]+$ ]]
curl --fail --silent --show-error --max-time 20 \
  --header "X-MS-Realty-Origin-Token: $origin_token" \
  "https://$review_host/api/health" > "$health_file"
node -e 'const d=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); if (d.service !== "ms-realty" || d.status !== "ok" || d.build_marker !== process.argv[2]) process.exit(1)' "$health_file" "$release_id"

trap - ERR
rm -f "$archive"
echo "production origin deployed: $release_id"
