export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      cash_ledger: {
        Row: {
          amount_paise: number
          competition_run_id: string
          created_at: string
          created_by: string
          description: string
          entry_type: string
          id: string
          reference_id: string | null
          reference_type: string | null
          team_id: string
        }
        Insert: {
          amount_paise: number
          competition_run_id: string
          created_at?: string
          created_by: string
          description?: string
          entry_type: string
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          team_id: string
        }
        Update: {
          amount_paise?: number
          competition_run_id?: string
          created_at?: string
          created_by?: string
          description?: string
          entry_type?: string
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_ledger_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "competition_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["competition_run_id"]
          },
          {
            foreignKeyName: "cash_ledger_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "team_portfolio_view"
            referencedColumns: ["competition_run_id"]
          },
          {
            foreignKeyName: "cash_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "cash_ledger_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_portfolio_view"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "cash_ledger_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_runs: {
        Row: {
          competition_id: string
          created_at: string
          ended_at: string | null
          id: string
          name: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          name: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          name?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_runs_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      dividend_payments: {
        Row: {
          amount_per_share_paise: number
          cash_ledger_entry_id: string | null
          competition_run_id: string
          created_at: string
          dividend_id: string
          id: string
          shares_held: number
          stock_id: string
          team_id: string
          total_amount_paise: number
        }
        Insert: {
          amount_per_share_paise: number
          cash_ledger_entry_id?: string | null
          competition_run_id: string
          created_at?: string
          dividend_id: string
          id?: string
          shares_held: number
          stock_id: string
          team_id: string
          total_amount_paise: number
        }
        Update: {
          amount_per_share_paise?: number
          cash_ledger_entry_id?: string | null
          competition_run_id?: string
          created_at?: string
          dividend_id?: string
          id?: string
          shares_held?: number
          stock_id?: string
          team_id?: string
          total_amount_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "dividend_payments_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "competition_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dividend_payments_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["competition_run_id"]
          },
          {
            foreignKeyName: "dividend_payments_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "team_portfolio_view"
            referencedColumns: ["competition_run_id"]
          },
          {
            foreignKeyName: "dividend_payments_dividend_id_fkey"
            columns: ["dividend_id"]
            isOneToOne: false
            referencedRelation: "dividends"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dividend_payments_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dividend_payments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "dividend_payments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_portfolio_view"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "dividend_payments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      dividends: {
        Row: {
          amount_per_share_paise: number
          applied_at: string | null
          competition_run_id: string
          created_at: string
          created_by: string
          id: string
          status: string
          stock_id: string
        }
        Insert: {
          amount_per_share_paise: number
          applied_at?: string | null
          competition_run_id: string
          created_at?: string
          created_by: string
          id?: string
          status?: string
          stock_id: string
        }
        Update: {
          amount_per_share_paise?: number
          applied_at?: string | null
          competition_run_id?: string
          created_at?: string
          created_by?: string
          id?: string
          status?: string
          stock_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dividends_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "competition_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dividends_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["competition_run_id"]
          },
          {
            foreignKeyName: "dividends_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "team_portfolio_view"
            referencedColumns: ["competition_run_id"]
          },
          {
            foreignKeyName: "dividends_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dividends_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stocks"
            referencedColumns: ["id"]
          },
        ]
      }
      holdings: {
        Row: {
          competition_run_id: string
          created_at: string
          id: string
          quantity: number
          stock_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          competition_run_id: string
          created_at?: string
          id?: string
          quantity?: number
          stock_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          competition_run_id?: string
          created_at?: string
          id?: string
          quantity?: number
          stock_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holdings_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "competition_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["competition_run_id"]
          },
          {
            foreignKeyName: "holdings_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "team_portfolio_view"
            referencedColumns: ["competition_run_id"]
          },
          {
            foreignKeyName: "holdings_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "holdings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_portfolio_view"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "holdings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          competition_run_id: string
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          operation_type: string
          request_hash: string
          result_id: string | null
          result_status: string
          team_id: string
        }
        Insert: {
          competition_run_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          operation_type: string
          request_hash: string
          result_id?: string | null
          result_status?: string
          team_id: string
        }
        Update: {
          competition_run_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          operation_type?: string
          request_hash?: string
          result_id?: string | null
          result_status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "competition_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idempotency_keys_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["competition_run_id"]
          },
          {
            foreignKeyName: "idempotency_keys_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "team_portfolio_view"
            referencedColumns: ["competition_run_id"]
          },
          {
            foreignKeyName: "idempotency_keys_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "idempotency_keys_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_portfolio_view"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "idempotency_keys_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      market_quotes: {
        Row: {
          competition_run_id: string
          id: string
          price_paise: number
          stock_id: string
          updated_at: string
        }
        Insert: {
          competition_run_id: string
          id?: string
          price_paise: number
          stock_id: string
          updated_at?: string
        }
        Update: {
          competition_run_id?: string
          id?: string
          price_paise?: number
          stock_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_quotes_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "competition_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_quotes_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["competition_run_id"]
          },
          {
            foreignKeyName: "market_quotes_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "team_portfolio_view"
            referencedColumns: ["competition_run_id"]
          },
          {
            foreignKeyName: "market_quotes_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stocks"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_price_changes: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          new_price_paise: number
          old_price_paise: number
          stock_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          new_price_paise: number
          old_price_paise: number
          stock_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          new_price_paise?: number
          old_price_paise?: number
          stock_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_price_changes_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "price_change_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_price_changes_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stocks"
            referencedColumns: ["id"]
          },
        ]
      }
      price_change_batches: {
        Row: {
          applied_at: string | null
          competition_run_id: string
          created_at: string
          created_by: string
          id: string
          status: string
        }
        Insert: {
          applied_at?: string | null
          competition_run_id: string
          created_at?: string
          created_by: string
          id?: string
          status?: string
        }
        Update: {
          applied_at?: string | null
          competition_run_id?: string
          created_at?: string
          created_by?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_change_batches_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "competition_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_change_batches_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["competition_run_id"]
          },
          {
            foreignKeyName: "price_change_batches_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "team_portfolio_view"
            referencedColumns: ["competition_run_id"]
          },
          {
            foreignKeyName: "price_change_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      realtime_notifications: {
        Row: {
          channel: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          team_id: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          team_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          team_id?: string | null
        }
        Relationships: []
      }
      rounds: {
        Row: {
          competition_run_id: string
          created_at: string
          ends_at: string | null
          id: string
          market_status: string
          round_number: number
          round_type: string
          started_at: string | null
          status: string
          trading_status: string
          updated_at: string
        }
        Insert: {
          competition_run_id: string
          created_at?: string
          ends_at?: string | null
          id?: string
          market_status?: string
          round_number: number
          round_type: string
          started_at?: string | null
          status?: string
          trading_status?: string
          updated_at?: string
        }
        Update: {
          competition_run_id?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          market_status?: string
          round_number?: number
          round_type?: string
          started_at?: string | null
          status?: string
          trading_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rounds_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "competition_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["competition_run_id"]
          },
          {
            foreignKeyName: "rounds_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "team_portfolio_view"
            referencedColumns: ["competition_run_id"]
          },
        ]
      }
      stocks: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          name: string
          symbol: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name: string
          symbol: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          id: string
          joined_at: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_portfolio_view"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          competition_run_id: string
          created_by: string
          executed_at: string
          executed_price_paise: number
          id: string
          idempotency_key: string | null
          quantity: number
          side: string
          stock_id: string
          team_id: string
          total_value_paise: number
        }
        Insert: {
          competition_run_id: string
          created_by: string
          executed_at?: string
          executed_price_paise: number
          id?: string
          idempotency_key?: string | null
          quantity: number
          side: string
          stock_id: string
          team_id: string
          total_value_paise: number
        }
        Update: {
          competition_run_id?: string
          created_by?: string
          executed_at?: string
          executed_price_paise?: number
          id?: string
          idempotency_key?: string | null
          quantity?: number
          side?: string
          stock_id?: string
          team_id?: string
          total_value_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "trades_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "competition_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["competition_run_id"]
          },
          {
            foreignKeyName: "trades_competition_run_id_fkey"
            columns: ["competition_run_id"]
            isOneToOne: false
            referencedRelation: "team_portfolio_view"
            referencedColumns: ["competition_run_id"]
          },
          {
            foreignKeyName: "trades_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "trades_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_portfolio_view"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "trades_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      leaderboard_view: {
        Row: {
          cash_balance_paise: number | null
          competition_run_id: string | null
          holdings_value_paise: number | null
          initial_capital_paise: number | null
          pnl_paise: number | null
          portfolio_value_paise: number | null
          rank: number | null
          return_basis_points: number | null
          team_id: string | null
          team_name: string | null
        }
        Relationships: []
      }
      team_portfolio_view: {
        Row: {
          cash_balance_paise: number | null
          competition_run_id: string | null
          holdings_value_paise: number | null
          initial_capital_paise: number | null
          pnl_paise: number | null
          portfolio_value_paise: number | null
          return_basis_points: number | null
          team_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _get_run_id_from_round: { Args: { p_round_id: string }; Returns: string }
      adjust_team_cash:
        | {
            Args: {
              p_amount_paise: number
              p_competition_run_id: string
              p_reason: string
              p_team_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_amount_paise: number
              p_competition_run_id: string
              p_idempotency_key?: string
              p_reason: string
              p_team_id: string
            }
            Returns: Json
          }
      apply_dividend: { Args: { p_dividend_id: string }; Returns: Json }
      apply_price_changes: { Args: { p_batch_id: string }; Returns: Json }
      assert_admin: { Args: never; Returns: undefined }
      cancel_price_batch: { Args: { p_batch_id: string }; Returns: Json }
      cleanup_old_notifications: {
        Args: { p_max_age?: string }
        Returns: number
      }
      close_market: { Args: { p_round_id: string }; Returns: Json }
      create_dividend: {
        Args: {
          p_amount_per_share_paise: number
          p_competition_run_id: string
          p_stock_id: string
        }
        Returns: Json
      }
      end_round: { Args: { p_round_id: string }; Returns: Json }
      ensure_profile: {
        Args: { p_email: string; p_name: string }
        Returns: undefined
      }
      execute_trade: {
        Args: {
          p_competition_run_id: string
          p_idempotency_key?: string
          p_quantity: number
          p_side: string
          p_stock_id: string
        }
        Returns: Json
      }
      get_leaderboard: { Args: { p_competition_run_id: string }; Returns: Json }
      get_team_holdings: {
        Args: { p_competition_run_id: string; p_team_id?: string }
        Returns: Json
      }
      get_team_portfolio: {
        Args: { p_competition_run_id: string; p_team_id?: string }
        Returns: Json
      }
      initialize_team_cash: {
        Args: {
          p_amount_paise: number
          p_competition_run_id: string
          p_team_id: string
        }
        Returns: Json
      }
      is_admin: { Args: { uid: string }; Returns: boolean }
      notify_realtime: {
        Args: {
          p_channel: string
          p_event_type: string
          p_payload?: Json
          p_team_id?: string
        }
        Returns: undefined
      }
      open_market: { Args: { p_round_id: string }; Returns: Json }
      pause_trading: { Args: { p_round_id: string }; Returns: Json }
      prepare_price_batch: {
        Args: { p_changes: Json; p_competition_run_id: string }
        Returns: Json
      }
      resolve_user_team: {
        Args: { p_competition_run_id: string; p_user_id: string }
        Returns: string
      }
      resume_trading: { Args: { p_round_id: string }; Returns: Json }
      set_profile_role: {
        Args: { p_email: string; p_role: string }
        Returns: undefined
      }
      setup_initial_prices: {
        Args: { p_competition_run_id: string; p_prices: Json }
        Returns: Json
      }
      start_round: { Args: { p_round_id: string }; Returns: Json }
      user_team_ids: { Args: { uid: string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
