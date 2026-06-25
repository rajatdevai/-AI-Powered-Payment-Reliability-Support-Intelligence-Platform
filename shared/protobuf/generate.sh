#!/usr/bin/env bash
# =============================================================================
# PRISM — gRPC Code Generation Script
# =============================================================================
# Generates TypeScript and Python stubs from the .proto files in this directory.
#
# Prerequisites:
#   Node.js:   npm install -g grpc-tools ts-protoc-gen
#   Python:    pip install grpcio-tools
#
# Run from repo root: bash shared/protobuf/generate.sh
# =============================================================================

set -e

PROTO_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_TS="$PROTO_DIR/generated/ts"
OUT_PY="$PROTO_DIR/generated/python"

mkdir -p "$OUT_TS" "$OUT_PY"

PROTOS=("prediction.proto" "incident.proto" "agent.proto")

echo "=== Generating TypeScript stubs ==="
for proto in "${PROTOS[@]}"; do
  grpc_tools_node_protoc \
    --js_out="import_style=commonjs,binary:$OUT_TS" \
    --grpc_out="grpc_js:$OUT_TS" \
    --plugin="protoc-gen-grpc=$(which grpc_tools_node_protoc_plugin)" \
    --ts_out="grpc_js:$OUT_TS" \
    --plugin="protoc-gen-ts=$(which protoc-gen-ts)" \
    -I "$PROTO_DIR" \
    "$proto"

  echo "  ✓ $proto → TypeScript"
done

echo ""
echo "=== Generating Python stubs ==="
for proto in "${PROTOS[@]}"; do
  python -m grpc_tools.protoc \
    -I "$PROTO_DIR" \
    --python_out="$OUT_PY" \
    --grpc_python_out="$OUT_PY" \
    --pyi_out="$OUT_PY" \
    "$proto"

  echo "  ✓ $proto → Python"
done

echo ""
echo "=== Generation complete ==="
echo "TypeScript stubs: $OUT_TS"
echo "Python stubs:     $OUT_PY"
