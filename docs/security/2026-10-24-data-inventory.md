# qkit personal-data inventory (2026-10-24)

Source: `supabase/migrations/0001` to `0106` on `origin/main`. Nothing is dropped by this PR. "Candidate to drop" rows need owner approval, then a follow-up migration PR.

| Table                      | Column                                     | Purpose                                              | Read by                                     | Retention today             | Verdict                                         |
| -------------------------- | ------------------------------------------ | ---------------------------------------------------- | ------------------------------------------- | --------------------------- | ----------------------------------------------- |
| `orders`                   | `customer_name`                            | Calls the customer when the order is ready           | Vendor board, customer status page, printer | Kept with the order         | Required; retention period to set in X-26       |
| `orders`                   | `access_token`                             | Customer's bearer link to their own order            | Customer status page                        | Kept with the order         | Required                                        |
| `orders`                   | `payment_proof_path`, `payment_proof_hash` | Vendor checks a PayNow screenshot; hash blocks reuse | Vendor proof viewer, duplicate check        | Image and hash kept forever | Required while the order is open; purge is X-26 |
| `orders`                   | `idempotency_key`                          | Stops a double-tapped order                          | `place_order` RPC                           | Kept with the order         | Candidate to drop after the order completes     |
| `order_push_subscriptions` | `endpoint`, `p256dh`, `auth`               | Web push to a customer's browser                     | Push sender                                 | Cascades with the order     | Required while the order is open                |
| `order_push_subscriptions` | `title`, `body`, `url`, `tag`              | Pre-built notification text                          | Push sender                                 | Cascades with the order     | Candidate to drop: rebuildable from the order   |
| `feedback`                 | `message`, `order_number`, `rating`        | Customer and vendor comments                         | Admin feedback page                         | Kept                        | Required; retention period to set in X-26       |
| `support_messages`         | `body`                                     | Vendor help requests                                 | Admin bell and inbox                        | Kept                        | Required; retention period to set in X-26       |
| `payments`                 | `note`                                     | Admin note on a manual pass payment                  | Admin vendor page                           | Kept                        | Required                                        |
| `events`                   | `metadata`                                 | Funnel counts (`boothId` only)                       | Admin stats                                 | Kept                        | Required; check no PII is ever written          |
| `legal_check_state`        | `email`                                    | Cache of merqo's legal-acceptance answer             | Legal gate                                  | Life of account             | Required                                        |
| `rate_limits`              | `key` (embeds client IP)                   | Throttle                                             | Rate limiter                                | Purged                      | Required                                        |
| `order_status_events`      | `actor`                                    | Who moved an order                                   | Order audit                                 | Kept                        | Required                                        |
| `admin_audit`              | `admin_id`, `detail`                       | Admin action trail                                   | Admin activity                              | Kept                        | Required                                        |

## Proposed drop list (owner approval needed)

1. `qkit.orders.idempotency_key`: only needed while the order is being placed.
2. `qkit.order_push_subscriptions.title`, `body`, `url`, `tag`: the text can be rebuilt from the order when the push is sent.
