#!/usr/bin/env sh
# Builds the deployable wasm. Host builds keep crate-type = ["lib"] so tests link on Windows;
# the cdylib is produced here for wasm32 only.
set -e
cd "$(dirname "$0")"
cargo rustc --release --target wasm32-unknown-unknown --lib --crate-type cdylib
echo "target/wasm32-unknown-unknown/release/gap_guard.wasm"
