-- Indexes. BUILD.md section 6 "Indexes that matter", plus lookups the money functions need.

-- clicks
create index clicks_link_created_idx on clicks (link_id, created_at);
create index clicks_brand_created_idx on clicks (brand_id, created_at);
create index clicks_ip_created_idx on clicks (ip_hash, created_at);
create index clicks_visitor_idx on clicks (visitor_id);

-- earnings: settlement and waitlist order
create index earnings_status_cycle_idx on earnings (status, cycle_ends_at);
create index earnings_promoter_created_idx on earnings (promoter_id, created_at);
create index earnings_brand_created_idx on earnings (brand_id, created_at);
create index earnings_link_status_idx on earnings (link_id, status);
create index earnings_waitlist_idx on earnings (brand_id, created_at, id) where status = 'waitlisted';

-- bids / daily board
create index bids_created_idx on bids (created_at);
create index bids_brand_idx on bids (brand_id, created_at);

-- brands: all-time board with the G1 tie-break (older total first)
create index brands_board_idx on brands (status, total_paid_cents desc, total_reached_at asc);
create index brands_category_idx on brands (category_id) where status = 'active';
create index brands_owner_idx on brands (owner_id);

-- ledgers
create index budget_ledger_brand_idx on budget_ledger (brand_id);
create index promoter_ledger_promoter_idx on promoter_ledger (promoter_id);

-- links, visitors
create index links_brand_idx on links (brand_id);
create index visitors_brand_idx on visitors (brand_id);
create index visitor_keys_visitor_idx on visitor_keys (visitor_id);

-- queues and review lists
create index fraud_flags_open_idx on fraud_flags (status, created_at) where status = 'open';
create index withdrawals_status_idx on withdrawals (status, created_at);
create index notification_outbox_due_idx on notification_outbox (send_after) where sent_at is null;
create index member_signals_brand_seen_idx on member_signals (brand_id, seen_at);
create index audit_log_subject_idx on audit_log (subject_type, subject_id);
