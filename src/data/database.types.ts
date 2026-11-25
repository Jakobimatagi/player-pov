export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type FilmStatus = 'uploading' | 'processing' | 'ready' | 'failed' | 'local'
/** 'hudl_export': clips stay on the coach's computer; nothing is stored. */
export type FilmSource = 'upload' | 'hudl_export'
export type FilmSide = 'offense' | 'defense' | 'special' | 'kick'

export type TeamRole = 'head_coach' | 'coach' | 'player'
export type PositionCode =
  'QB' | 'RB' | 'FB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'CB' | 'S' | 'K' | 'ATH'
export type PositionGroup = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'DB' | 'ST'
export type Side = 'offense' | 'defense'
/** Coordinator side and playbook side: a side of the ball, or special teams. */
export type StaffSide = Side | 'special'
/** A delegated scout pack section: not started, being charted, or ready for players. */
export type ScoutTaskStatus = 'todo' | 'in_progress' | 'ready'
/** What a second of study was spent on: the play sheet, or a viewer camera. */
export type ActivityKind = 'playbook' | 'pov' | 'broadcast' | 'topdown'

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
          film_quota_bytes: number
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
          coordinates: StaffSide | null
          coach_groups: PositionGroup[]
          created_at: string
        }
        Insert: {
          team_id: string
          user_id: string
          role: TeamRole
          position?: PositionCode | null
          coordinates?: StaffSide | null
          coach_groups?: PositionGroup[]
          created_at?: string
        }
        Update: {
          team_id?: string
          user_id?: string
          role?: TeamRole
          position?: PositionCode | null
          coordinates?: StaffSide | null
          coach_groups?: PositionGroup[]
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
          published_at: string | null
          published_by: string | null
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
          parent_id: string | null
          kind: 'playbook' | 'opponent'
          side: StaffSide | null
          base_formation: string | null
          pack_week: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          team_id: string
          name: string
          description?: string | null
          archived_at?: string | null
          parent_id?: string | null
          kind?: 'playbook' | 'opponent'
          side?: StaffSide | null
          base_formation?: string | null
          pack_week?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          team_id?: string
          name?: string
          description?: string | null
          archived_at?: string | null
          parent_id?: string | null
          kind?: 'playbook' | 'opponent'
          side?: StaffSide | null
          base_formation?: string | null
          pack_week?: string | null
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
      playbook_scripts: {
        Row: {
          playbook_id: string
          script: Json
          version: number
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          playbook_id: string
          script: Json
          version?: number
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          playbook_id?: string
          script?: Json
          version?: number
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      scout_tasks: {
        Row: {
          id: string
          team_id: string
          folder_id: string
          parent_task_id: string | null
          assignee_user: string | null
          assignee_group: PositionGroup | null
          due_at: string | null
          status: ScoutTaskStatus
          note: string | null
          status_by: string | null
          status_at: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          team_id: string
          folder_id: string
          parent_task_id?: string | null
          assignee_user?: string | null
          assignee_group?: PositionGroup | null
          due_at?: string | null
          status?: ScoutTaskStatus
          note?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          folder_id?: string
          assignee_user?: string | null
          assignee_group?: PositionGroup | null
          due_at?: string | null
          status?: ScoutTaskStatus
          note?: string | null
        }
        Relationships: []
      }
      film: {
        Row: {
          id: string
          team_id: string
          folder_id: string | null
          title: string
          opponent: string | null
          game_date: string | null
          source: FilmSource
          /** Null for a hudl_export film. */
          size_bytes: number | null
          storage_key: string | null
          proxy_key: string | null
          duration_ms: number | null
          status: FilmStatus
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          team_id: string
          folder_id?: string | null
          title: string
          opponent?: string | null
          game_date?: string | null
          source?: FilmSource
          size_bytes?: number | null
          created_by?: string | null
        }
        Update: {
          folder_id?: string | null
          title?: string
          opponent?: string | null
          game_date?: string | null
          status?: FilmStatus
        }
        Relationships: []
      }
      film_clips: {
        Row: {
          id: string
          team_id: string
          film_id: string
          start_ms: number
          end_ms: number
          play_number: number | null
          side: FilmSide | null
          quarter: number | null
          down: number | null
          distance: number | null
          hash: 'L' | 'M' | 'R' | null
          yard_line: number | null
          personnel: string | null
          formation: string | null
          front: string | null
          coverage: string | null
          result: string | null
          gain_loss: number | null
          play_id: string | null
          look_id: string | null
          tags: Json
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          team_id: string
          film_id: string
          start_ms: number
          end_ms: number
          play_number?: number | null
          side?: FilmSide | null
          quarter?: number | null
          down?: number | null
          distance?: number | null
          hash?: 'L' | 'M' | 'R' | null
          yard_line?: number | null
          personnel?: string | null
          formation?: string | null
          front?: string | null
          coverage?: string | null
          result?: string | null
          gain_loss?: number | null
          play_id?: string | null
          look_id?: string | null
          tags?: Json
        }
        Update: {
          start_ms?: number
          end_ms?: number
          play_number?: number | null
          side?: FilmSide | null
          quarter?: number | null
          down?: number | null
          distance?: number | null
          hash?: 'L' | 'M' | 'R' | null
          yard_line?: number | null
          personnel?: string | null
          formation?: string | null
          front?: string | null
          coverage?: string | null
          result?: string | null
          gain_loss?: number | null
          play_id?: string | null
          look_id?: string | null
          tags?: Json
        }
        Relationships: []
      }
      film_clip_files: {
        Row: {
          clip_id: string
          team_id: string
          angle: string
          file_name: string
          size_bytes: number
          sha256: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          clip_id: string
          team_id: string
          angle: string
          file_name: string
          size_bytes: number
          sha256: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      formation_templates: {
        Row: {
          id: string
          team_id: string
          side: Side
          name: string
          spots: Json
          created_by: string | null
          created_at: string
          updated_at: string
          archived_at: string | null
        }
        Insert: {
          id?: string
          team_id: string
          side: Side
          name: string
          spots: Json
          created_by?: string | null
          created_at?: string
          updated_at?: string
          archived_at?: string | null
        }
        Update: {
          id?: string
          team_id?: string
          side?: Side
          name?: string
          spots?: Json
          created_by?: string | null
          created_at?: string
          updated_at?: string
          archived_at?: string | null
        }
        Relationships: []
      }
      assignments: {
        Row: {
          id: string
          team_id: string
          playbook_id: string | null
          package_id: string | null
          rep_id: string | null
          assignee_user: string | null
          assignee_group: PositionGroup | null
          due_at: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          team_id: string
          playbook_id?: string | null
          package_id?: string | null
          rep_id?: string | null
          assignee_user?: string | null
          assignee_group?: PositionGroup | null
          due_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          team_id?: string
          playbook_id?: string | null
          package_id?: string | null
          rep_id?: string | null
          assignee_user?: string | null
          assignee_group?: PositionGroup | null
          due_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      player_slots: {
        Row: {
          team_id: string
          play_id: string
          user_id: string
          slot: string
        }
        Insert: {
          team_id: string
          play_id: string
          user_id: string
          slot: string
        }
        Update: {
          team_id?: string
          play_id?: string
          user_id?: string
          slot?: string
        }
        Relationships: []
      }
      position_rule_variants: {
        Row: {
          play_id: string
          slot: string
          scope: string
          match: string
          team_id: string
          side: Side
          alignment: string | null
          assignment: string | null
          adjustment: string | null
          key_read: string | null
          recognize: string | null
          react: string | null
          notes: string | null
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          play_id: string
          slot: string
          scope: string
          match: string
          team_id: string
          side: Side
          alignment?: string | null
          assignment?: string | null
          adjustment?: string | null
          key_read?: string | null
          recognize?: string | null
          react?: string | null
          notes?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          alignment?: string | null
          assignment?: string | null
          adjustment?: string | null
          key_read?: string | null
          recognize?: string | null
          react?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      position_rules: {
        Row: {
          play_id: string
          slot: string
          team_id: string
          side: Side
          alignment: string | null
          assignment: string | null
          key_read: string | null
          recognize: string | null
          react: string | null
          adjustment: string | null
          notes: string | null
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          play_id: string
          slot: string
          team_id: string
          side: Side
          alignment?: string | null
          assignment?: string | null
          key_read?: string | null
          recognize?: string | null
          react?: string | null
          adjustment?: string | null
          notes?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          alignment?: string | null
          assignment?: string | null
          key_read?: string | null
          recognize?: string | null
          react?: string | null
          adjustment?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      roster_players: {
        Row: {
          id: string
          team_id: string
          user_id: string | null
          name: string
          jersey: number | null
          position: PositionCode | null
          alt_positions: PositionCode[]
          grad_year: number | null
          height_in: number | null
          weight_lb: number | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          team_id: string
          user_id?: string | null
          name: string
          jersey?: number | null
          position?: PositionCode | null
          alt_positions?: PositionCode[]
          grad_year?: number | null
          height_in?: number | null
          weight_lb?: number | null
          notes?: string | null
        }
        Update: {
          user_id?: string | null
          name?: string
          jersey?: number | null
          position?: PositionCode | null
          alt_positions?: PositionCode[]
          grad_year?: number | null
          height_in?: number | null
          weight_lb?: number | null
          notes?: string | null
        }
        Relationships: []
      }
      depth_chart: {
        Row: {
          team_id: string
          slot: string
          rank: number
          roster_player_id: string
          updated_at: string
        }
        Insert: {
          team_id: string
          slot: string
          rank: number
          roster_player_id: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      /**
       * Coach notes on a roster player. Staff-only table; players read their shared
       * notes through my_depth_notes. created_by, dates and shared_at are set by trigger.
       */
      depth_notes: {
        Row: {
          id: string
          team_id: string
          roster_player_id: string
          slot: string | null
          body: string
          shared: boolean
          shared_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          team_id: string
          roster_player_id: string
          slot?: string | null
          body: string
          shared?: boolean
        }
        Update: {
          slot?: string | null
          body?: string
          shared?: boolean
        }
        Relationships: []
      }
      /** Daily study rollup. Read-only to clients; record_activity is the only writer. */
      activity_daily: {
        Row: {
          team_id: string
          user_id: string
          day: string
          play_id: string
          kind: ActivityKind
          slot: string
          seconds: number
          runs_started: number
          runs_completed: number
          updated_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      /** A coach's target spot for one (play, look, slot). Staff only. */
      scout_reps: {
        Row: {
          id: string
          team_id: string
          play_id: string
          look_id: string
          slot: string
          target_x: number
          target_y: number
          tolerance_yd: number
          note: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          team_id: string
          play_id: string
          look_id: string
          slot: string
          target_x: number
          target_y: number
          tolerance_yd?: number
          note?: string | null
          created_by?: string | null
        }
        Update: {
          target_x?: number
          target_y?: number
          tolerance_yd?: number
          note?: string | null
        }
        Relationships: []
      }
      /** Every try at a rep. Read-only to clients; submit_rep_attempt is the only writer. */
      rep_attempts: {
        Row: {
          id: string
          team_id: string
          assignment_id: string
          rep_id: string
          user_id: string
          end_x: number
          end_y: number
          distance_yd: number
          passed: boolean
          created_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
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
      set_depth: {
        Args: { p_team: string; p_slot: string; p_players: string[] }
        Returns: undefined
      }
      merge_roster_players: {
        Args: { p_keep: string; p_drop: string }
        Returns: undefined
      }
      team_billing: {
        Args: { p_team: string }
        Returns: {
          plan: 'starter' | 'team' | 'program'
          max_coaches: number | null
          max_players: number | null
          max_plays: number | null
          features: string[]
          coaches: number
          players: number
          plays: number
          film_used: number
          film_quota: number
          is_head_coach: boolean
          status: string | null
          renews_at: string | null
          past_due_since: string | null
          has_customer: boolean | null
          manual_until: string | null
        }[]
      }
      team_depth_notes: {
        Args: { p_team: string }
        Returns: {
          id: string
          roster_player_id: string
          slot: string | null
          body: string
          shared: boolean
          shared_at: string | null
          created_by: string | null
          author_name: string
          created_at: string
          updated_at: string
        }[]
      }
      my_depth_spots: {
        Args: { p_team: string }
        Returns: { slot: string; rank: number; depth: number }[]
      }
      my_depth_notes: {
        Args: { p_team: string }
        Returns: {
          id: string
          slot: string | null
          body: string
          author_name: string
          created_at: string
          updated_at: string
          shared_at: string | null
        }[]
      }
      position_group_of: {
        Args: { p: PositionCode }
        Returns: PositionGroup | null
      }
      health: {
        Args: Record<string, never>
        Returns: number
      }
      create_scout_pack: {
        Args: {
          p_team: string
          p_opponent: string
          p_week: string
          p_week_name: string
          p_side: StaffSide | null
          p_sections: string[]
        }
        Returns: string
      }
      publish_play: {
        Args: { p_play: string }
        Returns: string
      }
      unpublish_play: {
        Args: { p_play: string }
        Returns: undefined
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
      record_activity: {
        Args: {
          p_team: string
          p_play: string
          p_day: string
          p_kind: ActivityKind
          p_slot: string
          p_seconds: number
          p_runs_started?: number
          p_runs_completed?: number
        }
        Returns: undefined
      }
      activity_summary: {
        Args: { p_team: string; p_from: string; p_to: string }
        Returns: {
          user_id: string
          playbook_seconds: number
          pov_seconds: number
          broadcast_seconds: number
          topdown_seconds: number
          pov_reps: number
          own_slot_reps: number
          runs_started: number
          plays_opened: number
          days_active: number
          last_day: string | null
        }[]
      }
      submit_rep_attempt: {
        Args: { p_assignment: string; p_x: number; p_y: number }
        Returns: {
          attempt_id: string
          distance_yd: number
          passed: boolean
          target_x: number
          target_y: number
          tolerance_yd: number
          attempts: number
        }[]
      }
      my_rep_homework: {
        Args: { p_team: string }
        Returns: {
          assignment_id: string
          rep_id: string
          play_id: string
          play_name: string
          play_side: string
          look_id: string
          look_name: string
          slot: string
          due_at: string | null
          assigned_at: string
          attempts: number
          passed: boolean
          best_distance: number | null
          last_x: number | null
          last_y: number | null
          last_distance: number | null
          last_passed: boolean | null
          target_x: number | null
          target_y: number | null
          tolerance_yd: number | null
          note: string | null
        }[]
      }
      rep_results: {
        Args: { p_team: string }
        Returns: {
          assignment_id: string
          rep_id: string
          user_id: string
          due_at: string | null
          attempts: number
          first_distance: number | null
          first_passed: boolean | null
          best_distance: number | null
          passed: boolean
          last_at: string | null
        }[]
      }
      assignment_progress: {
        Args: { p_team: string }
        Returns: {
          assignment_id: string
          playbook_id: string
          playbook_name: string
          due_at: string | null
          user_id: string
          plays_total: number
          plays_opened: number
          plays_repped: number
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
