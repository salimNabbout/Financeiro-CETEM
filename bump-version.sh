#!/usr/bin/env bash
# Atualiza o cache-buster ?v=... em index.html para a data/hora atual.
# Rode ANTES de cada git commit para garantir que navegadores baixem a versao nova.
#
# Uso:
#   ./bump-version.sh
#   git add index.html
#   git commit -m "..."

set -e

NEW_VERSION=$(date +%Y%m%d%H%M)
INDEX_FILE="$(dirname "$0")/index.html"

if [ ! -f "$INDEX_FILE" ]; then
  echo "ERRO: $INDEX_FILE nao encontrado." >&2
  exit 1
fi

# Captura a versao atual (primeira ocorrencia de ?v=...)
OLD_VERSION=$(grep -oE '\?v=[0-9]+' "$INDEX_FILE" | head -1 | sed 's/?v=//')

if [ -z "$OLD_VERSION" ]; then
  echo "ERRO: nao encontrei nenhum ?v=... em index.html" >&2
  exit 1
fi

if [ "$OLD_VERSION" = "$NEW_VERSION" ]; then
  echo "Versao atual ($OLD_VERSION) ja eh a mesma do timestamp atual. Espere 1 minuto e rode de novo."
  exit 0
fi

# Substitui em todas as ocorrencias
sed -i "s/?v=$OLD_VERSION/?v=$NEW_VERSION/g" "$INDEX_FILE"

echo "Cache-buster atualizado: $OLD_VERSION -> $NEW_VERSION"
echo "Lembre de: git add index.html && git commit -m 'bump version'"
