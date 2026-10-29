<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- UI text lives in the static dictionary in src/lib/i18n.ts (fr default, ar RTL, en); add every new string for all three languages so switching never shows missing text.
- Payments settle only through the service-role `settle_order_payment` RPC (verified or simulation mode; simulation never writes seller ledger) — one idempotent, transactional path.
- Downloads go reserve_download → sign (300s) → finalize_download; release on signing failure — quota counts only finalized downloads and 5-minute repeats are free.
- Product files live in immutable `product_file_versions` with server-built paths; `product_files` is deprecated and kept only for compatibility.
- Financial, purchase-snapshot, entitlement and audit rows use ON DELETE RESTRICT plus immutability triggers — never cascade-delete them.
