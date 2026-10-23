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
          attester_kind: string | null
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
          attester_kind?: string | null
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
          attester_kind?: string | null
          statement_version?: string
          statement_text?: string
          attested_at?: string
        }
        Relationships: []
      }
      plays: {
        Row: {
          id: string
          team_id: string
          name: string
          side: 'offense' | 'defense'
          formation: string | null
          tags: string[]
          default_look_id: string | null
          current_version: number | null
          archived_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          team_id: string
          name: string
          side?: 'offense' | 'defense'
          formation?: string | null
          tags?: string[]
          default_look_id?: string | null
          current_version?: number | null
          archived_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          team_id?: string
          name?: string
          side?: 'offense' | 'defense'
          formation?: string | null
          tags?: string[]
          default_look_id?: string | null
          current_version?: number | null
          archived_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      play_versions: {
        Row: {
          play_id: string
          version: number
          source: Json
          compiled: Json
          source_schema: number
          compiled_schema: number
          compiler_version: string
          checksum: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          play_id: string
          version: number
          source: Json
          compiled: Json
          source_schema: number
          compiled_schema: number
          compiler_version: string
          checksum: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          play_id?: string
          version?: number
          source?: Json
          compiled?: Json
          source_schema?: number
          compiled_schema?: number
          compiler_version?: string
          checksum?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      scout_looks: {
        Row: {
          id: string
          team_id: string
          side: 'offense' | 'defense'
          name: string
          front: string | null
          coverage: string | null
          opponent: string | null
          current_version: number | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          team_id: string
          side: 'offense' | 'defense'
          name: string
          front?: string | null
          coverage?: string | null
          opponent?: string | null
          current_version?: number | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          team_id?: string
          side?: 'offense' | 'defense'
          name?: string
          front?: string | null
          coverage?: string | null
          opponent?: string | null
          current_version?: number | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      scout_look_versions: {
        Row: {
          look_id: string
          version: number
          source: Json
          checksum: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          look_id: string
          version: number
          source: Json
          checksum: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          look_id?: string
          version?: number
          source?: Json
          checksum?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      playbooks: {
        Row: {
          id: string
          team_id: string
          name: string
          description: string | null
          archived_at: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          team_id: string
          name: string
          description?: string | null
          archived_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          team_id?: string
          name?: string
          description?: string | null
          archived_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      playbook_plays: {
        Row: {
          playbook_id: string
          play_id: string
          sort: number
          pinned_version: number | null
        }
        Insert: {
          playbook_id: string
          play_id: string
          sort: number
          pinned_version?: number | null
        }
        Update: {
          playbook_id?: string
          play_id?: string
          sort?: number
          pinned_version?: number | null
        }
        Relationships: []
      }
      assignments: {
        Row: {
          id: string
          team_id: string
          playbook_id: string
          assignee_user: string | null
          assignee_group: PositionGroup | null
          due_at: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          team_id: string
          playbook_id: string
          assignee_user?: string | null
          assignee_group?: PositionGroup | null
          due_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          team_id?: string
          playbook_id?: string
          assignee_user?: string | null
          assignee_group?: PositionGroup | null
          due_at?: string | null
          created_by?: string | null
          created_at?: string
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
      accept_invite:
        | {
            Args: { p_invite_id: string }
            Returns: undefined
          }
        | {
            Args: { token: string }
            Returns: string
          }
      create_team: {
        Args: {
          p_name: string
          p_school: string
          p_season: string
          p_hash_rule: string
          p_season_ends_on: string
        }
        Returns: string
      }
      create_player_invite: {
        Args: {
          p_team: string
          p_email: string
          p_name: string
          p_role: TeamRole
          p_position: PositionCode | null
          p_consent: boolean
          p_statement: string | null
        }
        Returns: string
      }
      delete_member_data: {
        Args: { p_team: string; p_user: string }
        Returns: undefined
      }
      invite_status: {
        Args: { p_invite: string }
        Returns: string
      }
      remove_member: {
        Args: { p_team: string; p_user: string }
        Returns: undefined
      }
      resend_invite: {
        Args: { p_invite: string }
        Returns: string
      }
      revoke_invite: {
        Args: { p_invite: string }
        Returns: undefined
      }
      update_member: {
        Args: {
          p_team: string
          p_user: string
          p_role: TeamRole
          p_position: PositionCode | null
        }
        Returns: undefined
      }
      position_group_of: {
        Args: { p: PositionCode }
        Returns: PositionGroup | null
      }
      health: {
        Args: Record<string, never>
        Returns: number
      }
      save_play_version: {
        Args: {
          p_team: string
          p_play: string | null
          p_expected: number | null
          p_name: string
          p_source: Json
          p_compiled: Json
          p_checksum: string
          p_compiler: string
          p_look: string | null
          p_look_expected: number | null
          p_look_source: Json
          p_look_checksum: string
        }
        Returns: {
          play_id: string
          version: number
          look_id: string
          look_version: number
        }[]
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
