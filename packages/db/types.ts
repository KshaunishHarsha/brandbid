
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"details": Json | null,"id": number,"subject_id": string | null,"subject_type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"details"?: Json | null,"id"?: number,"subject_id"?: string | null,"subject_type"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"details"?: Json | null,"id"?: number,"subject_id"?: string | null,"subject_type"?: string | null
                  }
                  Relationships: [

                  ]
                },"beta_waitlist": {
                  Row: {
                    "created_at": string,"email": string,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"id"?: number
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"id"?: number
                  }
                  Relationships: [

                  ]
                },"bids": {
                  Row: {
                    "amount_cents": number,"brand_id": string,"budget_cents": number,"budget_refunded_cents": number,"created_at": string,"id": string,"payer_email": string | null,"payer_id": string,"payment_fingerprint": string | null,"processor": string,"processor_payment_id": string,"refund_attempts": number,"refund_last_error": string | null,"refund_ref": string | null,"refund_retry_at": string | null,"refunded_at": string | null,"revenue_cents": number,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"brand_id": string,"budget_cents": number,"budget_refunded_cents"?: number,"created_at"?: string,"id"?: string,"payer_email"?: string | null,"payer_id": string,"payment_fingerprint"?: string | null,"processor": string,"processor_payment_id": string,"refund_attempts"?: number,"refund_last_error"?: string | null,"refund_ref"?: string | null,"refund_retry_at"?: string | null,"refunded_at"?: string | null,"revenue_cents": number,"status"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"brand_id"?: string,"budget_cents"?: number,"budget_refunded_cents"?: number,"created_at"?: string,"id"?: string,"payer_email"?: string | null,"payer_id"?: string,"payment_fingerprint"?: string | null,"processor"?: string,"processor_payment_id"?: string,"refund_attempts"?: number,"refund_last_error"?: string | null,"refund_ref"?: string | null,"refund_retry_at"?: string | null,"refunded_at"?: string | null,"revenue_cents"?: number,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bids_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bids_payer_id_fkey"
      columns: ["payer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bids_payer_id_fkey"
      columns: ["payer_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"brand_members": {
                  Row: {
                    "brand_id": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"role"?: string,"user_id": string
                  }
                  Update: {
                    "brand_id"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "brand_members_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "brand_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "brand_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"brands": {
                  Row: {
                    "ads_enabled": boolean,"budget_cents": number,"category_id": number | null,"checked_at": string | null,"created_at": string,"description": string | null,"id": string,"last_spend_at": string | null,"logo_path": string | null,"name": string,"owner_id": string,"rate_cents": number,"review_reason": string | null,"slug": string,"status": string,"total_paid_cents": number,"total_reached_at": string | null,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ads_enabled"?: boolean,"budget_cents"?: number,"category_id"?: number | null,"checked_at"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"last_spend_at"?: string | null,"logo_path"?: string | null,"name": string,"owner_id": string,"rate_cents": number,"review_reason"?: string | null,"slug": string,"status"?: string,"total_paid_cents"?: number,"total_reached_at"?: string | null,"url": string
                  }
                  Update: {
                    "ads_enabled"?: boolean,"budget_cents"?: number,"category_id"?: number | null,"checked_at"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"last_spend_at"?: string | null,"logo_path"?: string | null,"name"?: string,"owner_id"?: string,"rate_cents"?: number,"review_reason"?: string | null,"slug"?: string,"status"?: string,"total_paid_cents"?: number,"total_reached_at"?: string | null,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "brands_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "brands_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "brands_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"budget_ledger": {
                  Row: {
                    "bid_id": string | null,"brand_id": string,"created_at": string,"delta_cents": number,"earning_id": string | null,"id": number,"reason": string,"refund_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bid_id"?: string | null,"brand_id": string,"created_at"?: string,"delta_cents": number,"earning_id"?: string | null,"id"?: number,"reason": string,"refund_id"?: string | null
                  }
                  Update: {
                    "bid_id"?: string | null,"brand_id"?: string,"created_at"?: string,"delta_cents"?: number,"earning_id"?: string | null,"id"?: number,"reason"?: string,"refund_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "budget_ledger_bid_id_fkey"
      columns: ["bid_id"]
isOneToOne: false
      referencedRelation: "bids"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "budget_ledger_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "budget_ledger_earning_fk"
      columns: ["earning_id"]
isOneToOne: false
      referencedRelation: "earnings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "budget_ledger_refund_fk"
      columns: ["refund_id"]
isOneToOne: false
      referencedRelation: "budget_refunds"
      referencedColumns: ["id"]
    }
                  ]
                },"budget_refund_items": {
                  Row: { "amount_cents": number,"attempts": number,"bid_id": string,"created_at": string,"done_at": string | null,"id": string,"last_error": string | null,"processor_refund_ref": string | null,"refund_id": string,"retry_at": string | null,"status": string }
                  ComputedFields: never
                  Insert: { "amount_cents": number,"attempts"?: number,"bid_id": string,"created_at"?: string,"done_at"?: string | null,"id"?: string,"last_error"?: string | null,"processor_refund_ref"?: string | null,"refund_id": string,"retry_at"?: string | null,"status"?: string }
                  Update: { "amount_cents"?: number,"attempts"?: number,"bid_id"?: string,"created_at"?: string,"done_at"?: string | null,"id"?: string,"last_error"?: string | null,"processor_refund_ref"?: string | null,"refund_id"?: string,"retry_at"?: string | null,"status"?: string }
                  Relationships: [
                    { foreignKeyName: "budget_refund_items_bid_id_fkey"; columns: ["bid_id"]; isOneToOne: false; referencedRelation: "bids"; referencedColumns: ["id"] },
                    { foreignKeyName: "budget_refund_items_refund_id_fkey"; columns: ["refund_id"]; isOneToOne: false; referencedRelation: "budget_refunds"; referencedColumns: ["id"] }
                  ]
                },"budget_refunds": {
                  Row: {
                    "amount_cents": number,"brand_id": string,"created_at": string,"done_at": string | null,"id": string,"processor_refund_ref": string | null,"requested_by": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"brand_id": string,"created_at"?: string,"done_at"?: string | null,"id"?: string,"processor_refund_ref"?: string | null,"requested_by": string,"status"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"brand_id"?: string,"created_at"?: string,"done_at"?: string | null,"id"?: string,"processor_refund_ref"?: string | null,"requested_by"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "budget_refunds_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "budget_refunds_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "budget_refunds_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "id": number,"name": string,"requires_review": boolean,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: number,"name": string,"requires_review"?: boolean,"slug": string
                  }
                  Update: {
                    "id"?: number,"name"?: string,"requires_review"?: boolean,"slug"?: string
                  }
                  Relationships: [

                  ]
                },"clicks": {
                  Row: {
                    "brand_id": string,"cookie_id": string | null,"country": string | null,"created_at": string,"id": string,"ignored_reason": string | null,"ip_hash": string,"link_id": string,"outbound_at": string | null,"promoter_id": string,"referrer": string | null,"ua_hash": string,"user_agent": string | null,"visitor_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"cookie_id"?: string | null,"country"?: string | null,"created_at"?: string,"id"?: string,"ignored_reason"?: string | null,"ip_hash": string,"link_id": string,"outbound_at"?: string | null,"promoter_id": string,"referrer"?: string | null,"ua_hash": string,"user_agent"?: string | null,"visitor_id"?: string | null
                  }
                  Update: {
                    "brand_id"?: string,"cookie_id"?: string | null,"country"?: string | null,"created_at"?: string,"id"?: string,"ignored_reason"?: string | null,"ip_hash"?: string,"link_id"?: string,"outbound_at"?: string | null,"promoter_id"?: string,"referrer"?: string | null,"ua_hash"?: string,"user_agent"?: string | null,"visitor_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "clicks_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clicks_link_id_fkey"
      columns: ["link_id"]
isOneToOne: false
      referencedRelation: "links"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clicks_promoter_id_fkey"
      columns: ["promoter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clicks_promoter_id_fkey"
      columns: ["promoter_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clicks_visitor_id_fkey"
      columns: ["visitor_id"]
isOneToOne: false
      referencedRelation: "visitors"
      referencedColumns: ["id"]
    }
                  ]
                },"earnings": {
                  Row: {
                    "amount_cents": number,"brand_id": string,"click_id": string,"created_at": string,"cycle_ends_at": string | null,"funded_at": string | null,"id": string,"link_id": string,"promoter_id": string,"settled_at": string | null,"status": string,"visitor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"brand_id": string,"click_id": string,"created_at"?: string,"cycle_ends_at"?: string | null,"funded_at"?: string | null,"id"?: string,"link_id": string,"promoter_id": string,"settled_at"?: string | null,"status"?: string,"visitor_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"brand_id"?: string,"click_id"?: string,"created_at"?: string,"cycle_ends_at"?: string | null,"funded_at"?: string | null,"id"?: string,"link_id"?: string,"promoter_id"?: string,"settled_at"?: string | null,"status"?: string,"visitor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "earnings_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earnings_link_id_fkey"
      columns: ["link_id"]
isOneToOne: false
      referencedRelation: "links"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earnings_promoter_id_fkey"
      columns: ["promoter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earnings_promoter_id_fkey"
      columns: ["promoter_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earnings_visitor_id_fkey"
      columns: ["visitor_id"]
isOneToOne: true
      referencedRelation: "visitors"
      referencedColumns: ["id"]
    }
                  ]
                },"fraud_flags": {
                  Row: {
                    "created_at": string,"details": Json | null,"id": string,"reviewed_at": string | null,"reviewed_by": string | null,"rule": string,"score": number,"status": string,"subject_id": string,"subject_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"details"?: Json | null,"id"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"rule": string,"score": number,"status"?: string,"subject_id": string,"subject_type": string
                  }
                  Update: {
                    "created_at"?: string,"details"?: Json | null,"id"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"rule"?: string,"score"?: number,"status"?: string,"subject_id"?: string,"subject_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fraud_flags_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fraud_flags_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"links": {
                  Row: {
                    "brand_id": string,"channel": string,"code": string,"created_at": string,"id": string,"promoter_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"channel": string,"code": string,"created_at"?: string,"id"?: string,"promoter_id": string,"status"?: string
                  }
                  Update: {
                    "brand_id"?: string,"channel"?: string,"code"?: string,"created_at"?: string,"id"?: string,"promoter_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "links_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "links_promoter_id_fkey"
      columns: ["promoter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "links_promoter_id_fkey"
      columns: ["promoter_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"member_signals": {
                  Row: {
                    "brand_id": string,"fp_hash": string | null,"id": number,"ip_hash": string,"seen_at": string,"ua_hash": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"fp_hash"?: string | null,"id"?: number,"ip_hash": string,"seen_at"?: string,"ua_hash": string,"user_id": string
                  }
                  Update: {
                    "brand_id"?: string,"fp_hash"?: string | null,"id"?: number,"ip_hash"?: string,"seen_at"?: string,"ua_hash"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_signals_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_signals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_signals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_outbox": {
                  Row: {
                    "attempts": number,"created_at": string,"dedupe_key": string | null,"id": number,"kind": string,"last_error": string | null,"payload": NonNullable<Json>,"recipient_email": string | null,"recipient_user_id": string | null,"send_after": string,"sent_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"dedupe_key"?: string | null,"id"?: number,"kind": string,"last_error"?: string | null,"payload"?: NonNullable<Json>,"recipient_email"?: string | null,"recipient_user_id"?: string | null,"send_after"?: string,"sent_at"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"dedupe_key"?: string | null,"id"?: number,"kind"?: string,"last_error"?: string | null,"payload"?: NonNullable<Json>,"recipient_email"?: string | null,"recipient_user_id"?: string | null,"send_after"?: string,"sent_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_outbox_recipient_user_id_fkey"
      columns: ["recipient_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_outbox_recipient_user_id_fkey"
      columns: ["recipient_user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_accounts": {
                  Row: {
                    "account_name": string | null,"created_at": string,"external_id": string,"id": string,"promoter_id": string,"provider": string,"verified": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "account_name"?: string | null,"created_at"?: string,"external_id": string,"id"?: string,"promoter_id": string,"provider": string,"verified"?: boolean
                  }
                  Update: {
                    "account_name"?: string | null,"created_at"?: string,"external_id"?: string,"id"?: string,"promoter_id"?: string,"provider"?: string,"verified"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_accounts_promoter_id_fkey"
      columns: ["promoter_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payout_accounts_promoter_id_fkey"
      columns: ["promoter_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "country": string | null,"created_at": string,"first_withdrawal_reviewed": boolean,"handle": string | null,"id": string,"is_admin": boolean,"kyc_status": string,"leaderboard_public": boolean,"phone_hash": string | null,"phone_verified_at": string | null,"promoter_terms_accepted_at": string | null,"status": string,"trust_score": number
                  }
                  ComputedFields: never
                  Insert: {
                    "country"?: string | null,"created_at"?: string,"first_withdrawal_reviewed"?: boolean,"handle"?: string | null,"id": string,"is_admin"?: boolean,"kyc_status"?: string,"leaderboard_public"?: boolean,"phone_hash"?: string | null,"phone_verified_at"?: string | null,"promoter_terms_accepted_at"?: string | null,"status"?: string,"trust_score"?: number
                  }
                  Update: {
                    "country"?: string | null,"created_at"?: string,"first_withdrawal_reviewed"?: boolean,"handle"?: string | null,"id"?: string,"is_admin"?: boolean,"kyc_status"?: string,"leaderboard_public"?: boolean,"phone_hash"?: string | null,"phone_verified_at"?: string | null,"promoter_terms_accepted_at"?: string | null,"status"?: string,"trust_score"?: number
                  }
                  Relationships: [

                  ]
                },"promoter_ledger": {
                  Row: {
                    "created_at": string,"delta_cents": number,"earning_id": string | null,"id": number,"note": string | null,"promoter_id": string,"reason": string,"withdrawal_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"delta_cents": number,"earning_id"?: string | null,"id"?: number,"note"?: string | null,"promoter_id": string,"reason": string,"withdrawal_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"delta_cents"?: number,"earning_id"?: string | null,"id"?: number,"note"?: string | null,"promoter_id"?: string,"reason"?: string,"withdrawal_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "promoter_ledger_earning_id_fkey"
      columns: ["earning_id"]
isOneToOne: false
      referencedRelation: "earnings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promoter_ledger_promoter_id_fkey"
      columns: ["promoter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promoter_ledger_promoter_id_fkey"
      columns: ["promoter_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promoter_ledger_withdrawal_fk"
      columns: ["withdrawal_id"]
isOneToOne: false
      referencedRelation: "withdrawals"
      referencedColumns: ["id"]
    }
                  ]
                },"qualify_rejections": {
                  Row: {
                    "click_id": string | null,"created_at": string,"id": number,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "click_id"?: string | null,"created_at"?: string,"id"?: number,"reason": string
                  }
                  Update: {
                    "click_id"?: string | null,"created_at"?: string,"id"?: number,"reason"?: string
                  }
                  Relationships: [

                  ]
                },"settings": {
                  Row: {
                    "key": string,"value": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"value"?: Json | null
                  }
                  Update: {
                    "key"?: string,"value"?: Json | null
                  }
                  Relationships: [

                  ]
                },"visitor_keys": {
                  Row: {
                    "brand_id": string,"created_at": string,"key_hash": string,"key_type": string,"visitor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"created_at"?: string,"key_hash": string,"key_type": string,"visitor_id": string
                  }
                  Update: {
                    "brand_id"?: string,"created_at"?: string,"key_hash"?: string,"key_type"?: string,"visitor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "visitor_keys_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "visitor_keys_visitor_id_fkey"
      columns: ["visitor_id"]
isOneToOne: false
      referencedRelation: "visitors"
      referencedColumns: ["id"]
    }
                  ]
                },"visitors": {
                  Row: {
                    "brand_id": string,"claim_click_id": string | null,"claim_expires_at": string | null,"claim_link_id": string | null,"claim_promoter_id": string | null,"claim_rate_cents": number | null,"created_at": string,"id": string,"qualified_active_ms": number | null,"qualified_at": string | null,"qualified_click_id": string | null,"qualified_fp_hash": string | null,"qualified_interactions": number | null,"qualified_ip_hash": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"claim_click_id"?: string | null,"claim_expires_at"?: string | null,"claim_link_id"?: string | null,"claim_promoter_id"?: string | null,"claim_rate_cents"?: number | null,"created_at"?: string,"id"?: string,"qualified_active_ms"?: number | null,"qualified_at"?: string | null,"qualified_click_id"?: string | null,"qualified_fp_hash"?: string | null,"qualified_interactions"?: number | null,"qualified_ip_hash"?: string | null
                  }
                  Update: {
                    "brand_id"?: string,"claim_click_id"?: string | null,"claim_expires_at"?: string | null,"claim_link_id"?: string | null,"claim_promoter_id"?: string | null,"claim_rate_cents"?: number | null,"created_at"?: string,"id"?: string,"qualified_active_ms"?: number | null,"qualified_at"?: string | null,"qualified_click_id"?: string | null,"qualified_fp_hash"?: string | null,"qualified_interactions"?: number | null,"qualified_ip_hash"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "visitors_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "visitors_claim_link_id_fkey"
      columns: ["claim_link_id"]
isOneToOne: false
      referencedRelation: "links"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "visitors_claim_promoter_id_fkey"
      columns: ["claim_promoter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "visitors_claim_promoter_id_fkey"
      columns: ["claim_promoter_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"withdrawals": {
                  Row: {
                    "amount_cents": number,"created_at": string,"external_ref": string | null,"fee_cents": number | null,"id": string,"paid_at": string | null,"promoter_id": string,"provider": string,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"external_ref"?: string | null,"fee_cents"?: number | null,"id"?: string,"paid_at"?: string | null,"promoter_id": string,"provider": string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"external_ref"?: string | null,"fee_cents"?: number | null,"id"?: string,"paid_at"?: string | null,"promoter_id"?: string,"provider"?: string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "withdrawals_promoter_id_fkey"
      columns: ["promoter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "withdrawals_promoter_id_fkey"
      columns: ["promoter_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "public_profiles": {
                  Row: {
                    "handle": string | null,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                           "handle"?: string | null,"id"?: string | null
                         }
                        Update: {
                           "handle"?: string | null,"id"?: string | null
                         }
                        Relationships: [

                  ]
                }
          }
          Functions: {
            "admin_fraud_queue":
{ Args: { "p_admin_id": string }; Returns: Json
                           },
            "admin_search_users":
{ Args: { "p_admin_id": string,"p_query": string }; Returns: Json
                           },
            "admin_ban_promoter":
{ Args: { "p_admin_id": string,"p_promoter_id": string,"p_reason": string }; Returns: Json
                           },
            "admin_search_brands":
{ Args: { "p_admin_id": string,"p_query": string }; Returns: Json
                           },
            "admin_reconciliation_history":
{ Args: { "p_admin_id": string,"p_limit"?: number }; Returns: Json
                           },
            "admin_settings":
{ Args: { "p_admin_id": string }; Returns: Json
                           },
            "admin_budget_refunds":
{ Args: { "p_admin_id": string,"p_limit"?: number }; Returns: Json
                           },
            "admin_complete_budget_refund_item":
{ Args: { "p_admin_id": string,"p_item_id": string,"p_reference": string }; Returns: Json
                           },
            "admin_withdrawal_queue":
{ Args: { "p_admin_id": string,"p_limit"?: number }; Returns: Json
                           },
            "admin_review_withdrawal":
{ Args: { "p_admin_id": string,"p_withdrawal_id": string,"p_decision": string,"p_reason"?: string | null }; Returns: Json
                           },
            "admin_update_setting":
{ Args: { "p_admin_id": string,"p_key": string,"p_reason": string,"p_value": Json }; Returns: Json
                           },
            "report_brand_suspicious_traffic":
{ Args: { "p_brand_id": string,"p_reason": string,"p_reporter_id": string }; Returns: Json
                           },
            "create_brand_invite":
{ Args: { "p_brand_id": string,"p_email": string,"p_expires_at": string,"p_invited_by": string,"p_token": string,"p_token_hash": string }; Returns: Json
                           },
            "accept_brand_invite":
{ Args: { "p_token_hash": string,"p_user_id": string }; Returns: Json
                           },
            "admin_disable_brand_ads":
{ Args: { "p_admin_id": string,"p_brand_id": string,"p_reason": string }; Returns: Json
                           },
            "admin_remove_brand":
{ Args: { "p_admin_id": string,"p_brand_id": string,"p_reason": string }; Returns: Json
                           },
            "admin_suspend_promoter":
{ Args: { "p_admin_id": string,"p_promoter_id": string,"p_reason": string }; Returns: Json
                           },
            "admin_pending_listings":
{ Args: Record<PropertyKey, never>; Returns: {
              "bid_count": number,"brand_id": string,"category_id": number,"category_name": string,"category_requires_review": boolean,"checked_at": string,"created_at": string,"description": string,"logo_path": string,"name": string,"owner_email": string,"owner_id": string,"review_reason": string,"slug": string,"total_paid_cents": number,"url": string
            }[]
                           },
"admin_set_category":
{ Args: { "p_admin_id": string,"p_brand_id": string,"p_category_id": number }; Returns: Json
                           },
"approve_listing":
{ Args: { "p_admin_id": string,"p_brand_id": string }; Returns: Json
                           },
"brand_budget_summary":
{ Args: { "p_brand_id": string }; Returns: {
              "added_cents": number,"rate_cents": number,"refunded_cents": number,"remaining_cents": number,"spent_cents": number,"visitors_left": number,"waitlisted_cents": number,"waitlisted_count": number
            }[]
                           },
"budget_refund_eligibility":
{ Args: { "p_brand_id": string,"p_requester": string }; Returns: Json
                           },
"refund_budget":
{ Args: { "p_brand_id": string,"p_requester": string }; Returns: Json
                           },
"brand_ranks":
{ Args: { "p_brand_id": string }; Returns: {
              "all_time_rank": number,"today_cents": number,"today_rank": number
            }[]
                           },
"brand_traffic_stats":
{ Args: { "p_brand_id": string }; Returns: Json
                           },
"promoter_leaderboard":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_period": string }; Returns: {
              "board_rank": number,"earned_cents": number,"handle": string,"qualified_visitors": number
            }[]
                           },
"discover_brands":
{ Args: { "p_limit"?: number,"p_offset"?: number }; Returns: {
              "brand_id": string,"description": string | null,"logo_path": string | null,"name": string,"rate_cents": number,"remaining_budget_cents": number,"slug": string,"url": string,"visitors_left": number
            }[]
                           },
"top_promoters_for_brand":
{ Args: { "p_brand_id": string,"p_limit"?: number }; Returns: {
              "board_rank": number,"earned_cents": number,"handle": string | null,"is_anonymous": boolean,"qualified_visitors": number
            }[]
                           },
"category_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": number,"live_brands": number,"name": string,"slug": string
            }[]
                           },
"claim_price":
{ Args: { "p_brand_id": string,"p_rank": number }; Returns: number
                           },
"claim_price_ladder":
{ Args: { "p_brand_id"?: string }; Returns: {
              "price_cents": number,"target_rank": number
            }[]
                           },
"qualify_visitor":
{ Args: { "p_active_ms": number,"p_click_id": string,"p_cookie_id": string | null,"p_fp_hash": string | null,"p_interactions": number,"p_ip_hash": string,"p_ua_hash": string }; Returns: string
                           },
"cleanup_stale_listings":
{ Args: { "p_days"?: number }; Returns: Json
                           },
"cycle_end":
{ Args: { "p_at": string,"p_link_created": string }; Returns: string
                           },
"find_user_id_by_email":
{ Args: { "p_email": string }; Returns: string
                           },
"fund_waitlist":
{ Args: { "p_brand_id": string }; Returns: number
                           },
"get_or_create_link":
{ Args: { "p_brand_id": string,"p_channel": string,"p_code": string,"p_promoter_id": string }; Returns: {
              "brand_id": string,
"channel": string,
"code": string,
"created_at": string,
"id": string,
"promoter_id": string,
"status": string
            }
                          SetofOptions: {
        from: "*"
        to: "links"
        isOneToOne: true
        isSetofReturn: false
      } },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_brand_member":
{ Args: { "p_brand_id": string }; Returns: boolean
                           },
"leaderboard_all_time":
{ Args: { "p_category_id"?: number,"p_limit"?: number,"p_offset"?: number }; Returns: {
              "board_rank": number,"brand_id": string,"category_id": number,"description": string,"logo_path": string,"name": string,"slug": string,"take_price_cents": number,"total_paid_cents": number,"url": string
            }[]
                           },
"leaderboard_today":
{ Args: { "p_category_id"?: number,"p_limit"?: number,"p_offset"?: number }; Returns: {
              "board_rank": number,"brand_id": string,"category_id": number,"description": string,"logo_path": string,"name": string,"slug": string,"today_cents": number,"total_paid_cents": number,"url": string
            }[]
                           },
"promoter_dashboard":
{ Args: { "p_promoter_id": string }; Returns: Json
                           },
"record_bid":
{ Args: { "p_amount_cents": number,"p_brand_id": string,"p_payer_email"?: string,"p_payer_id": string,"p_payment_fingerprint"?: string,"p_processor": string,"p_processor_payment_id": string }; Returns: Json
                           },
"record_click":
{ Args: { "p_brand_id": string,"p_click_id": string,"p_cookie_hash"?: string,"p_cookie_id"?: string,"p_country"?: string,"p_ip_hash": string,"p_ipua_hash": string,"p_link_id": string,"p_promoter_id": string,"p_rate_limited": boolean,"p_referrer"?: string,"p_ua_hash": string,"p_user_agent"?: string,"p_viewer_user_id"?: string }; Returns: undefined
                           },
"review_fraud_flag":
{ Args: { "p_admin_id": string,"p_decision": string,"p_flag_id": string,"p_reason": string }; Returns: Json
                           },
"ban_promoter":
{ Args: { "p_admin_id": string,"p_promoter_id": string,"p_reason": string }; Returns: Json
                           },
"reject_listing":
{ Args: { "p_admin_id": string,"p_brand_id": string,"p_reason": string }; Returns: Json
                           },
"utc_day_start":
{ Args: Record<PropertyKey, never>; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {

          }
        },"public": {
          Enums: {

          }
        }
} as const
