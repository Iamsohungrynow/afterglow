# Vendored patches

## stylus-proc 0.9.0

An unmodified copy of [`stylus-proc` 0.9.0](https://crates.io/crates/stylus-proc) from
[OffchainLabs/stylus-sdk-rs](https://github.com/OffchainLabs/stylus-sdk-rs), by Offchain Labs,
licensed **MIT OR Apache-2.0**, with one addition at the end of `src/lib.rs`: a host-only
`native_keccak256` implementation.

Why: `stylus-proc` enables alloy-primitives' `native-keccak` feature, which expects the Stylus runtime
to provide `native_keccak256`. The macro crate runs on the build host and hashes selectors at
expansion time. Linux linkers leave the symbol unresolved, but MSVC refuses to link the macro DLL,
so without this patch Stylus contracts cannot be built natively on Windows. The shim is compiled
only for non-wasm targets, so deployed contracts are byte-for-byte unaffected.

It is wired in through `[patch.crates-io]` in `stylus/gap-guard/Cargo.toml`. Linux and macOS builds
do not need it and can remove that section.
