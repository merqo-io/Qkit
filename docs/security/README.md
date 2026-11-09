# security

Security records for qkit.

## Contents

- `2026-10-24-data-inventory.md`: personal-data columns, who reads them, retention and a proposed drop list. Nothing is dropped until the owner approves it. Payment screenshots are deleted with their order, drained by a daily cron (100 rows per run; rows failing 5 times wait for manual inspection).
