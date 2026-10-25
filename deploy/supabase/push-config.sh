#!/usr/bin/env bash
# Preview or apply hosted Supabase settings for one environment. See DEPLOYMENT.md section 3.
#
#   deploy/supabase/push-config.sh staging                       # preview the core settings (applies nothing)
#   deploy/supabase/push-config.sh staging --apply               # apply the core settings
#   deploy/supabase/push-config.sh staging --templates [--apply] # also include the email templates (needs custom SMTP first)
#
# Needs `supabase login`. Only the properties declared in deploy/supabase/<env>/*.toml are touched; the repo's main
# supabase/config.toml (local-development values) is never pushed.
set -euo pipefail
cd "$(dirname "$0")/../.."
ENV_NAME="${1:-}"; shift || true
APPLY=0; TEMPLATES=0
for a in "$@"; do case "$a" in --apply) APPLY=1 ;; --templates) TEMPLATES=1 ;; *) echo "Unknown option: $a" >&2; exit 2 ;; esac; done
SRC="deploy/supabase/$ENV_NAME"
[ -f "$SRC/core.toml" ] || { echo "Usage: $0 <env> [--templates] [--apply]   (known: $(ls deploy/supabase | grep -v '\.sh$' | tr '\n' ' '))" >&2; exit 2; }
REF="$(tr -d '[:space:]' < "$SRC/project-ref")"

# Build a throwaway project folder holding exactly the settings to push. (The CLI refuses template paths outside the
# project folder, so the current template is copied in; building it fresh each time means it can never be stale.)
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/supabase/templates"
{ echo "project_id = \"brandbid-$ENV_NAME\""; echo; cat "$SRC/core.toml"; } > "$WORK/supabase/config.toml"
if [ "$TEMPLATES" = 1 ]; then
  { echo; cat "$SRC/templates.toml"; } >> "$WORK/supabase/config.toml"
  cp supabase/templates/magic_link.html "$WORK/supabase/templates/magic_link.html"
fi

if [ "$APPLY" = 1 ]; then
  echo "Applying $ENV_NAME settings to project $REF"
  supabase config push --workdir "$WORK" --project-ref "$REF" --yes
else
  echo "Preview only (nothing is applied). Add --apply to apply. Project $REF"
  supabase config push --workdir "$WORK" --project-ref "$REF" </dev/null
fi
