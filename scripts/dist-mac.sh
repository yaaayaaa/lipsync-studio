#!/usr/bin/env bash
# Mac 版を署名・公証してビルドする。
# 使い方: scripts/dist-mac.sh [electron-builder に渡す引数...]（例: --publish never / --publish always）
#
# 署名の鍵と公証の API キーはリポジトリに置かない。~/.config/lipsync-studio-signing/ から読む
# （場所は LIPSYNC_SIGNING_DIR で変えられる）。
set -euo pipefail

cd "$(dirname "$0")/.."

signing_dir="${LIPSYNC_SIGNING_DIR:-$HOME/.config/lipsync-studio-signing}"
keychain="$signing_dir/signing.keychain-db"
keychain_password_file="$signing_dir/keychain-password"
notary_env="$signing_dir/notary.env"

for f in "$keychain" "$keychain_password_file" "$notary_env"; do
  if [[ ! -f "$f" ]]; then
    echo "dist-mac: $f がありません" >&2
    exit 1
  fi
done

# 証明書は login キーチェーンではなく専用キーチェーンに置いている。
# GUI のないセッション（ssh など）からは login キーチェーンの鍵で codesign が errSecInternalComponent になるため。
# パスワードは -p で渡すと ps に見えるので、標準入力から渡す
security unlock-keychain "$keychain" <"$keychain_password_file" >/dev/null
# 終わったら（失敗で抜けたときも）鍵をかけ直し、署名の鍵を開いたままにしない
trap 'security lock-keychain "$keychain" || true' EXIT

# APPLE_API_KEY（.p8 の絶対パス）・APPLE_API_KEY_ID・APPLE_API_ISSUER。
# electron-builder はこの3つがそろっていると @electron/notarize で .app を公証する
set -a
# shellcheck source=/dev/null
source "$notary_env"
set +a
for v in APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER; do
  if [[ -z "${!v:-}" ]]; then
    echo "dist-mac: $notary_env に $v がありません" >&2
    exit 1
  fi
done

# CSC_LINK があると electron-builder は一時キーチェーンを作ってそちらを使うので、専用キーチェーンが無視される。
# CSC_KEYCHAIN は CSC_LINK がないときだけ使われる
unset CSC_LINK CSC_KEY_PASSWORD
export CSC_KEYCHAIN="$keychain"
# electron-builder は "Developer ID Application: " の接頭辞付きの名前を受け付けない（付けるとエラーで止まる）
export CSC_NAME="Waffle, LLC. (GZPRJF9P3F)"

npm run build
npm run electron:build
npx electron-builder --mac "$@"

# electron-builder は公証の資格情報が欠けると警告だけで先へ進む。
# 公証されていない物を配らないよう、できた .app と dmg に公証の票が付いているかをここで確かめる
version="$(node -p "require('./package.json').version")"
shopt -s nullglob
built=(release/mac*/lipsync-studio.app release/lipsync-studio-"$version"*.dmg)
if [[ ${#built[@]} -eq 0 ]]; then
  echo "dist-mac: release/ に .app も dmg も見つかりません" >&2
  exit 1
fi
for f in "${built[@]}"; do
  xcrun stapler validate "$f"
done
