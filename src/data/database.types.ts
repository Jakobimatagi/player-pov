export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type TeamRole = 'head_coach' | 'coach' | 'player'
export type PositionCode =
  'QB' | 'RB' | 'FB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'CB' | 'S' | 'K' | 'ATH'
export type PositionGroup = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'DB' | 'ST'

export type Database = {
  public: {
    Tables: {
      teams: {
        Row: {
          id: string
          name: string
          school: string | null
          season: string | null
          hash_rule: string
          season_ends_on: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          school?: string | null
          season?: string | null
          hash_rule?: string
          season_ends_on: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          school?: string | null
          season?: string | null
          hash_rule?: string
          season_ends_on?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          user_id: string
          display_name: string
          created_at: string
        }
        Insert: {
          user_id: string
          display_name: string
          created_at?: string
        }
        Update: {
          user_id?: string
          display_name?: string
          created_at?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          team_id: string
          user_id: string
          role: TeamRole
          position: PositionCode | null
          created_at: string
        }
        Insert: {
          team_id: string
          user_id: string
          role: TeamRole
          position?: PositionCode | null
          created_at?: string
        }
        Update: {
          team_id?: string
          user_id?: string
          role?: TeamRole
          position?: PositionCode | null
          created_at?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          id: string
          team_id: string
          email: string
          display_name: string
          role: TeamRole
          position: PositionCode | null
          token_hash: string
          invited_by: string | null
          expires_at: string
          accepted_at: string | null
        }
        Insert: {
          id?: string
          team_id: string
          email: string
          display_name: string
          role: TeamRole
          position?: PositionCode | null
          token_hash: string
          invited_by?: string | null
          expires_at?: string
          accepted_at?: string | null
        }
        Update: {
          id?: string
          team_id?: string
          email?: string
          display_name?: string
          role?: TeamRole
          position?: PositionCode | null
          token_hash?: string
          invited_by?: string | null
          expires_at?: string
          accepted_at?: string | null
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          id: string
          team_id: string
          invite_id: string | null
          user_id: string | null
          subject_email: string
          attested_by: string | null
          attested_email: string
          statement_version: string
          statement_text: string
          attested_at: string
        }
        Insert: {
          id?: string
          team_id: string
          invite_id?: string | null
          user_id?: string | null
          subject_email: string
          attested_by?: string | null
          attested_email?: string
          statement_version: string
          statement_text: string
          attested_at?: string
        }
        Update: {
          id?: string
          team_id?: string
          invite_id?: string | null
          user_id?: string | null
          subject_email?: string
          attested_by?: string | null
          attested_email?: string
          statement_version?: string
          statement_text?: string
          attested_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      roster_public: {
        Row: {
          team_id: string
          user_id: string
          display_name: string
          position: PositionCode | null
          role: TeamRole
        }
        Relationships: []
      }
    }
    Functions: {
      position_group_of: {
        Args: { p: PositionCode }
        Returns: PositionGroup | null
      }
    }
    Enums: {
      team_role: TeamRole
      position_code: PositionCode
      position_group: PositionGroup
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
