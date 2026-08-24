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

# Nothing here ever reclaimed disk, so every release directory, every Docker
# build layer and every archive left by a failed run stayed forever. The host
# filled up and a build died with "no space left on device" - and the rollback
# failed straight after, because restoring the release pointer also needs an
# inode. Reclaim first, while the only operations are deletions, so a full disk
# heals itself on the next attempt instead of ratcheting further shut.
keep_releases=3
reclaim() {
  # Archives from earlier runs: this deploy needs only its own.
  find "$base/incoming" -maxdepth 1 -type f -name '*.tar.gz' ! -name "$release_id.tar.gz" -delete 2>/dev/null || true
  find "$base/incoming" -maxdepth 1 -type f -name '*.deploy.sh' ! -name "$release_id.deploy.sh" -delete 2>/dev/null || true
  # An extraction that died midway leaves a staging directory, which also blocks
  # a retry of the same release.
  find "$releases" -maxdepth 1 -type d -name '.staging-*' ! -name ".staging-$release_id" -exec rm -rf {} + 2>/dev/null || true
  # Keep the running release, the incoming one, and enough history to roll back.
  local current_path candidate
  current_path="$(readlink -f "$current" 2>/dev/null || true)"
  while read -r candidate; do
    [[ -z "$candidate" ]] && continue
    [[ "$candidate" == "$release" ]] && continue
    [[ -n "$current_path" && "$candidate" == "$current_path" ]] && continue
    echo "reclaiming old release $(basename "$candidate")" >&2
    rm -rf "$candidate" || true
  done < <(find "$releases" -maxdepth 1 -mindepth 1 -type d -name '[0-9a-f]*' -printf '%T@ %p\n' 2>/dev/null |
    sort -rn | tail -n +$((keep_releases + 1)) | cut -d' ' -f2-)
  # Build cache only. Images are deliberately left alone: the very next step
  # backs up the previous release by running a container from that release's
  # image, and the new image is not built until later, so anything that removes
  # images here breaks the backup before a replacement exists. Release
  # directories and build cache are where the space actually went.
  docker builder prune --force >/dev/null 2>&1 || true
}
reclaim

# A build that runs out of room fails deep inside BuildKit as an opaque
# ResourceExhausted; say it plainly here instead. The floor is deliberately low:
# it should catch only the genuinely doomed run, never veto one that would have
# squeezed through, because a wrong guess here blocks every deploy.
free_kb="$(df -Pk "$base" | awk 'NR == 2 { print $4 }')"
if [[ -n "$free_kb" ]] && ((free_kb < 1048576)); then
  echo "origin has $((free_kb / 1024)) MB free under $base after reclaiming; a Docker build of this app cannot finish below 1 GB" >&2
  exit 2
fi

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
backup_skipped=false
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
  # The backup quiesces public writes, which stops the running containers, and
  # it needs the previous release's image to do it. When that image is missing
  # the backup dies with the site already stopped and nothing restarts it: a
  # safety net became the only thing holding production down. It must not be
  # able to do that again. A failure here is loud and recorded, and the deploy
  # continues to build and start the new release, which is what brings the site
  # back. The rollback path is unaffected - the previous release directory is
  # still on disk and can rebuild its own image from its own source.
  if ! run_stack "$previous" docker:backup "$(basename "$previous")"; then
    echo "WARNING: pre-deploy backup of $(basename "$previous") failed; continuing without a fresh snapshot" >&2
    backup_skipped=true
    run_stack "$previous" docker:up "$(basename "$previous")" || true
  fi
fi

activate "$release"
switched=true
run_stack "$release" docker:hermes:up "$release_id" || rollback "$?"

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
reclaim
if [[ "$backup_skipped" == true ]]; then
  echo "production origin deployed: $release_id (WITHOUT a pre-deploy snapshot; take one before the next release)" >&2
else
  echo "production origin deployed: $release_id"
fi
