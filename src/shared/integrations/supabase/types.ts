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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          audience: Database["public"]["Enums"]["announcement_audience"]
          batch_id: string | null
          course_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          link: string | null
          message: string
          priority: Database["public"]["Enums"]["announcement_priority"]
          published_at: string | null
          status: Database["public"]["Enums"]["announcement_status"]
          title: string
          updated_at: string
        }
        Insert: {
          audience: Database["public"]["Enums"]["announcement_audience"]
          batch_id?: string | null
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          link?: string | null
          message: string
          priority?: Database["public"]["Enums"]["announcement_priority"]
          published_at?: string | null
          status?: Database["public"]["Enums"]["announcement_status"]
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["announcement_audience"]
          batch_id?: string | null
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          link?: string | null
          message?: string
          priority?: Database["public"]["Enums"]["announcement_priority"]
          published_at?: string | null
          status?: Database["public"]["Enums"]["announcement_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_access: {
        Row: {
          assessment_id: string
          batch_id: string | null
          created_at: string
          id: string
          student_id: string | null
        }
        Insert: {
          assessment_id: string
          batch_id?: string | null
          created_at?: string
          id?: string
          student_id?: string | null
        }
        Update: {
          assessment_id?: string
          batch_id?: string | null
          created_at?: string
          id?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_access_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_access_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_access_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_export_view"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "assessment_access_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_answer_keys: {
        Row: {
          correct: Json
          created_at: string
          question_id: string
          updated_at: string
        }
        Insert: {
          correct: Json
          created_at?: string
          question_id: string
          updated_at?: string
        }
        Update: {
          correct?: Json
          created_at?: string
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_answer_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "assessment_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_attempt_answers: {
        Row: {
          answer: Json | null
          attempt_id: string
          created_at: string
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          marks_awarded: number | null
          question_id: string
          updated_at: string
        }
        Insert: {
          answer?: Json | null
          attempt_id: string
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          marks_awarded?: number | null
          question_id: string
          updated_at?: string
        }
        Update: {
          answer?: Json | null
          attempt_id?: string
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          marks_awarded?: number | null
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_attempt_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "assessment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_attempt_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "assessment_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_attempts: {
        Row: {
          assessment_id: string
          created_at: string
          deadline_at: string
          id: string
          max_score: number
          score: number | null
          started_at: string
          status: Database["public"]["Enums"]["assessment_attempt_status"]
          student_id: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          deadline_at: string
          id?: string
          max_score?: number
          score?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["assessment_attempt_status"]
          student_id: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          deadline_at?: string
          id?: string
          max_score?: number
          score?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["assessment_attempt_status"]
          student_id?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_attempts_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_export_view"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "assessment_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_questions: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          marks: number
          options: Json
          prompt: string
          question_type: Database["public"]["Enums"]["assessment_question_type"]
          sort_order: number
          updated_at: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          marks?: number
          options?: Json
          prompt: string
          question_type: Database["public"]["Enums"]["assessment_question_type"]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          marks?: number
          options?: Json
          prompt?: string
          question_type?: Database["public"]["Enums"]["assessment_question_type"]
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_questions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          access_mode: Database["public"]["Enums"]["assessment_access_mode"]
          course_id: string
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number | null
          ends_at: string | null
          id: string
          image_path: string | null
          language: string
          name: string
          published_at: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["assessment_status"]
          updated_at: string
        }
        Insert: {
          access_mode?: Database["public"]["Enums"]["assessment_access_mode"]
          course_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          ends_at?: string | null
          id?: string
          image_path?: string | null
          language?: string
          name: string
          published_at?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["assessment_status"]
          updated_at?: string
        }
        Update: {
          access_mode?: Database["public"]["Enums"]["assessment_access_mode"]
          course_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          ends_at?: string | null
          id?: string
          image_path?: string | null
          language?: string
          name?: string
          published_at?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["assessment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_answer_keys: {
        Row: {
          correct: Json
          created_at: string
          question_id: string
          updated_at: string
        }
        Insert: {
          correct: Json
          created_at?: string
          question_id: string
          updated_at?: string
        }
        Update: {
          correct?: Json
          created_at?: string
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_answer_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "assignment_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_questions: {
        Row: {
          assignment_id: string
          code_language: string | null
          created_at: string
          id: string
          marks: number
          options: Json
          prompt: string
          question_type: Database["public"]["Enums"]["assignment_question_type"]
          sort_order: number
          starter_code: string | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          code_language?: string | null
          created_at?: string
          id?: string
          marks: number
          options?: Json
          prompt: string
          question_type: Database["public"]["Enums"]["assignment_question_type"]
          sort_order?: number
          starter_code?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          code_language?: string | null
          created_at?: string
          id?: string
          marks?: number
          options?: Json
          prompt?: string
          question_type?: Database["public"]["Enums"]["assignment_question_type"]
          sort_order?: number
          starter_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_questions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          attachment_name: string | null
          attachment_path: string | null
          batch_id: string
          course_id: string
          created_at: string
          due_at: string | null
          id: string
          instructions: string | null
          max_score: number
          module_id: string | null
          status: Database["public"]["Enums"]["assignment_status"]
          title: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_path?: string | null
          batch_id: string
          course_id: string
          created_at?: string
          due_at?: string | null
          id?: string
          instructions?: string | null
          max_score: number
          module_id?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          title: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          attachment_name?: string | null
          attachment_path?: string | null
          batch_id?: string
          course_id?: string
          created_at?: string
          due_at?: string | null
          id?: string
          instructions?: string | null
          max_score?: number
          module_id?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          title?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_batch_id_course_id_fkey"
            columns: ["batch_id", "course_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id", "course_id"]
          },
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_module_id_course_id_fkey"
            columns: ["module_id", "course_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id", "course_id"]
          },
          {
            foreignKeyName: "assignments_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainer_export_view"
            referencedColumns: ["trainer_id"]
          },
          {
            foreignKeyName: "assignments_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          attendance_percent: number | null
          class_id: string
          created_at: string
          duration_seconds: number | null
          id: string
          joined_at: string | null
          left_at: string | null
          marked_at: string
          marked_by: string | null
          original_status:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          overridden_at: string | null
          overridden_by: string | null
          override_reason: string | null
          remarks: string | null
          sessions: Json | null
          source: Database["public"]["Enums"]["attendance_source"]
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          attendance_percent?: number | null
          class_id: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          marked_at?: string
          marked_by?: string | null
          original_status?:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          overridden_at?: string | null
          overridden_by?: string | null
          override_reason?: string | null
          remarks?: string | null
          sessions?: Json | null
          source?: Database["public"]["Enums"]["attendance_source"]
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          attendance_percent?: number | null
          class_id?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          marked_at?: string
          marked_by?: string | null
          original_status?:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          overridden_at?: string | null
          overridden_by?: string | null
          override_reason?: string | null
          remarks?: string | null
          sessions?: Json | null
          source?: Database["public"]["Enums"]["attendance_source"]
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_overridden_by_fkey"
            columns: ["overridden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_export_view"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          request_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          request_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          request_id?: string | null
        }
        Relationships: []
      }
      batches: {
        Row: {
          capacity: number
          code: string
          course_id: string
          created_at: string
          description: string | null
          end_date: string
          id: string
          name: string
          schedule: string | null
          start_date: string
          status: Database["public"]["Enums"]["batch_status"]
          updated_at: string
        }
        Insert: {
          capacity: number
          code: string
          course_id: string
          created_at?: string
          description?: string | null
          end_date: string
          id?: string
          name: string
          schedule?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["batch_status"]
          updated_at?: string
        }
        Update: {
          capacity?: number
          code?: string
          course_id?: string
          created_at?: string
          description?: string | null
          end_date?: string
          id?: string
          name?: string
          schedule?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["batch_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          batch_id: string | null
          certificate_number: string
          certificate_type: Database["public"]["Enums"]["certificate_type"]
          course_id: string | null
          created_at: string
          id: string
          internship_id: string | null
          issue_date: string
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: Database["public"]["Enums"]["certificate_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          certificate_number: string
          certificate_type: Database["public"]["Enums"]["certificate_type"]
          course_id?: string | null
          created_at?: string
          id?: string
          internship_id?: string | null
          issue_date?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["certificate_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          certificate_number?: string
          certificate_type?: Database["public"]["Enums"]["certificate_type"]
          course_id?: string | null
          created_at?: string
          id?: string
          internship_id?: string | null
          issue_date?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["certificate_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_internship_id_fkey"
            columns: ["internship_id"]
            isOneToOne: false
            referencedRelation: "internships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_export_view"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "certificates_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          attendance_attempts: number
          attendance_last_error: string | null
          attendance_next_attempt_at: string | null
          attendance_processed_at: string | null
          attendance_status: string
          batch_id: string
          class_date: string
          class_type: Database["public"]["Enums"]["class_type"]
          course_id: string
          created_at: string
          end_time: string
          ended_at: string | null
          id: string
          location: string | null
          meet_url: string | null
          module_id: string | null
          notes: string | null
          recording_attempts: number
          recording_checked_at: string | null
          recording_next_attempt_at: string | null
          recording_status: string
          start_time: string
          started_at: string | null
          status: Database["public"]["Enums"]["class_status"]
          title: string
          trainer_id: string
          updated_at: string
          zoho_created_at: string | null
          zoho_join_url: string | null
          zoho_last_error: string | null
          zoho_last_synced_at: string | null
          zoho_meeting_key: string | null
          zoho_status: string
        }
        Insert: {
          attendance_attempts?: number
          attendance_last_error?: string | null
          attendance_next_attempt_at?: string | null
          attendance_processed_at?: string | null
          attendance_status?: string
          batch_id: string
          class_date: string
          class_type?: Database["public"]["Enums"]["class_type"]
          course_id: string
          created_at?: string
          end_time: string
          ended_at?: string | null
          id?: string
          location?: string | null
          meet_url?: string | null
          module_id?: string | null
          notes?: string | null
          recording_attempts?: number
          recording_checked_at?: string | null
          recording_next_attempt_at?: string | null
          recording_status?: string
          start_time: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["class_status"]
          title: string
          trainer_id: string
          updated_at?: string
          zoho_created_at?: string | null
          zoho_join_url?: string | null
          zoho_last_error?: string | null
          zoho_last_synced_at?: string | null
          zoho_meeting_key?: string | null
          zoho_status?: string
        }
        Update: {
          attendance_attempts?: number
          attendance_last_error?: string | null
          attendance_next_attempt_at?: string | null
          attendance_processed_at?: string | null
          attendance_status?: string
          batch_id?: string
          class_date?: string
          class_type?: Database["public"]["Enums"]["class_type"]
          course_id?: string
          created_at?: string
          end_time?: string
          ended_at?: string | null
          id?: string
          location?: string | null
          meet_url?: string | null
          module_id?: string | null
          notes?: string | null
          recording_attempts?: number
          recording_checked_at?: string | null
          recording_next_attempt_at?: string | null
          recording_status?: string
          start_time?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["class_status"]
          title?: string
          trainer_id?: string
          updated_at?: string
          zoho_created_at?: string | null
          zoho_join_url?: string | null
          zoho_last_error?: string | null
          zoho_last_synced_at?: string | null
          zoho_meeting_key?: string | null
          zoho_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_batch_id_course_id_fkey"
            columns: ["batch_id", "course_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id", "course_id"]
          },
          {
            foreignKeyName: "classes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_module_id_course_id_fkey"
            columns: ["module_id", "course_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id", "course_id"]
          },
          {
            foreignKeyName: "classes_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainer_export_view"
            referencedColumns: ["trainer_id"]
          },
          {
            foreignKeyName: "classes_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      course_modules: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          id: string
          sort_order: number
          status: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          created_at: string
          currency: string
          duration: string | null
          id: string
          level: Database["public"]["Enums"]["course_level"] | null
          long_description: string | null
          price: number
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["content_status"]
          thumbnail_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          duration?: string | null
          id?: string
          level?: Database["public"]["Enums"]["course_level"] | null
          long_description?: string | null
          price?: number
          short_description?: string | null
          slug: string
          status?: Database["public"]["Enums"]["content_status"]
          thumbnail_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          duration?: string | null
          id?: string
          level?: Database["public"]["Enums"]["course_level"] | null
          long_description?: string | null
          price?: number
          short_description?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["content_status"]
          thumbnail_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          batch_id: string
          course_id: string
          created_at: string
          currency: string
          enrolled_at: string
          fee_amount: number
          id: string
          removed_at: string | null
          status: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          transferred_at: string | null
          updated_at: string
        }
        Insert: {
          batch_id: string
          course_id: string
          created_at?: string
          currency?: string
          enrolled_at?: string
          fee_amount: number
          id?: string
          removed_at?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          transferred_at?: string | null
          updated_at?: string
        }
        Update: {
          batch_id?: string
          course_id?: string
          created_at?: string
          currency?: string
          enrolled_at?: string
          fee_amount?: number
          id?: string
          removed_at?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id?: string
          transferred_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_batch_id_course_id_fkey"
            columns: ["batch_id", "course_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id", "course_id"]
          },
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_export_view"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          configured: boolean
          created_at: string
          enabled: boolean
          integration: Database["public"]["Enums"]["integration_kind"]
          last_checked_at: string | null
          metadata: Json
          provider: string | null
          status: Database["public"]["Enums"]["integration_state"]
          updated_at: string
        }
        Insert: {
          configured?: boolean
          created_at?: string
          enabled?: boolean
          integration: Database["public"]["Enums"]["integration_kind"]
          last_checked_at?: string | null
          metadata?: Json
          provider?: string | null
          status?: Database["public"]["Enums"]["integration_state"]
          updated_at?: string
        }
        Update: {
          configured?: boolean
          created_at?: string
          enabled?: boolean
          integration?: Database["public"]["Enums"]["integration_kind"]
          last_checked_at?: string | null
          metadata?: Json
          provider?: string | null
          status?: Database["public"]["Enums"]["integration_state"]
          updated_at?: string
        }
        Relationships: []
      }
      internships: {
        Row: {
          batch_id: string | null
          course_id: string | null
          created_at: string
          duration: string | null
          end_date: string | null
          id: string
          notes: string | null
          organization: string
          start_date: string
          status: Database["public"]["Enums"]["internship_status"]
          student_id: string
          title: string
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          course_id?: string | null
          created_at?: string
          duration?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          organization: string
          start_date: string
          status?: Database["public"]["Enums"]["internship_status"]
          student_id: string
          title: string
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          course_id?: string | null
          created_at?: string
          duration?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          organization?: string
          start_date?: string
          status?: Database["public"]["Enums"]["internship_status"]
          student_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internships_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internships_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internships_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_export_view"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "internships_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          last_accessed_at: string | null
          lesson_id: string
          started: boolean
          started_at: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          last_accessed_at?: string | null
          lesson_id: string
          started?: boolean
          started_at?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          last_accessed_at?: string | null
          lesson_id?: string
          started?: boolean
          started_at?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_export_view"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "lesson_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_resources: {
        Row: {
          created_at: string
          description: string | null
          id: string
          lesson_id: string
          metadata: Json
          resource_type: Database["public"]["Enums"]["resource_type"]
          resource_url: string | null
          sort_order: number
          storage_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          lesson_id: string
          metadata?: Json
          resource_type: Database["public"]["Enums"]["resource_type"]
          resource_url?: string | null
          sort_order?: number
          storage_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          lesson_id?: string
          metadata?: Json
          resource_type?: Database["public"]["Enums"]["resource_type"]
          resource_url?: string | null
          sort_order?: number
          storage_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_resources_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: string | null
          created_at: string
          description: string | null
          id: string
          module_id: string
          sort_order: number
          status: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          description?: string | null
          id?: string
          module_id: string
          sort_order?: number
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          description?: string | null
          id?: string
          module_id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempts: number
          channel: Database["public"]["Enums"]["delivery_channel"]
          created_at: string
          id: string
          last_error: string | null
          next_attempt_at: string
          notification_id: string
          provider_ref: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          channel: Database["public"]["Enums"]["delivery_channel"]
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          notification_id: string
          provider_ref?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          channel?: Database["public"]["Enums"]["delivery_channel"]
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          notification_id?: string
          provider_ref?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          category: string
          created_at: string
          email_enabled: boolean
          id: string
          in_app_enabled: boolean
          push_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          push_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          push_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          category: string
          created_at: string
          event_key: string | null
          id: string
          link: string | null
          read_at: string | null
          recipient_id: string
          title: string
        }
        Insert: {
          body?: string | null
          category: string
          created_at?: string
          event_key?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          recipient_id: string
          title: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          event_key?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          recipient_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          enrollment_id: string
          id: string
          installment_no: number | null
          method: Database["public"]["Enums"]["payment_method"]
          paid_on: string
          recorded_by: string | null
          remarks: string | null
          transaction_ref: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          enrollment_id: string
          id?: string
          installment_no?: number | null
          method: Database["public"]["Enums"]["payment_method"]
          paid_on: string
          recorded_by?: string | null
          remarks?: string | null
          transaction_ref?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          enrollment_id?: string
          id?: string
          installment_no?: number | null
          method?: Database["public"]["Enums"]["payment_method"]
          paid_on?: string
          recorded_by?: string | null
          remarks?: string | null
          transaction_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollment_fee_summary"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          must_change_password: boolean
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          must_change_password?: boolean
          phone?: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          must_change_password?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          disabled_at: string | null
          disabled_reason: string | null
          endpoint: string
          id: string
          last_used_at: string | null
          public_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          disabled_at?: string | null
          disabled_reason?: string | null
          endpoint: string
          id?: string
          last_used_at?: string | null
          public_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          disabled_at?: string | null
          disabled_reason?: string | null
          endpoint?: string
          id?: string
          last_used_at?: string | null
          public_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_views: {
        Row: {
          completed: boolean
          created_at: string
          id: string
          last_position_seconds: number
          recording_id: string
          student_id: string
          updated_at: string
          watched_seconds: number
        }
        Insert: {
          completed?: boolean
          created_at?: string
          id?: string
          last_position_seconds?: number
          recording_id: string
          student_id: string
          updated_at?: string
          watched_seconds?: number
        }
        Update: {
          completed?: boolean
          created_at?: string
          id?: string
          last_position_seconds?: number
          recording_id?: string
          student_id?: string
          updated_at?: string
          watched_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "recording_views_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_views_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_export_view"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "recording_views_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      recordings: {
        Row: {
          available_from: string
          class_id: string
          created_at: string
          description: string | null
          duration_seconds: number | null
          id: string
          source_type: Database["public"]["Enums"]["recording_source"]
          source_url: string | null
          storage_path: string | null
          thumbnail_path: string | null
          title: string
          updated_at: string
          zoho_recording_id: string | null
        }
        Insert: {
          available_from?: string
          class_id: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          source_type: Database["public"]["Enums"]["recording_source"]
          source_url?: string | null
          storage_path?: string | null
          thumbnail_path?: string | null
          title: string
          updated_at?: string
          zoho_recording_id?: string | null
        }
        Update: {
          available_from?: string
          class_id?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          source_type?: Database["public"]["Enums"]["recording_source"]
          source_url?: string | null
          storage_path?: string | null
          thumbnail_path?: string | null
          title?: string
          updated_at?: string
          zoho_recording_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recordings_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          admission_date: string | null
          city: string | null
          created_at: string
          date_of_birth: string | null
          education: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          gender: Database["public"]["Enums"]["gender"] | null
          id: string
          institution: string | null
          pincode: string | null
          profile_id: string
          state: string | null
          student_code: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          admission_date?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          education?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          institution?: string | null
          pincode?: string | null
          profile_id: string
          state?: string | null
          student_code: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          admission_date?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          education?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          institution?: string | null
          pincode?: string | null
          profile_id?: string
          state?: string | null
          student_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_answers: {
        Row: {
          answer: Json | null
          created_at: string
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          marks_awarded: number | null
          question_id: string
          submission_id: string
          updated_at: string
        }
        Insert: {
          answer?: Json | null
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          marks_awarded?: number | null
          question_id: string
          submission_id: string
          updated_at?: string
        }
        Update: {
          answer?: Json | null
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          marks_awarded?: number | null
          question_id?: string
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "assignment_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_files: {
        Row: {
          created_at: string
          file_size: number
          id: string
          mime_type: string
          original_filename: string
          storage_path: string
          submission_id: string
        }
        Insert: {
          created_at?: string
          file_size: number
          id?: string
          mime_type: string
          original_filename: string
          storage_path: string
          submission_id: string
        }
        Update: {
          created_at?: string
          file_size?: number
          id?: string
          mime_type?: string
          original_filename?: string
          storage_path?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_files_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          assignment_id: string
          created_at: string
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          score: number | null
          status: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at: string | null
          text_content: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          assignment_id: string
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          score?: number | null
          status?: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at?: string | null
          text_content?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          assignment_id?: string
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          score?: number | null
          status?: Database["public"]["Enums"]["submission_status"]
          student_id?: string
          submitted_at?: string | null
          text_content?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_export_view"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      trainer_assignments: {
        Row: {
          batch_id: string
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_assignments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_assignments_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainer_export_view"
            referencedColumns: ["trainer_id"]
          },
          {
            foreignKeyName: "trainer_assignments_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainers: {
        Row: {
          bio: string | null
          created_at: string
          experience_years: number | null
          id: string
          joining_date: string | null
          location: string | null
          profile_id: string
          qualification: string | null
          specialization: string | null
          trainer_code: string
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          experience_years?: number | null
          id?: string
          joining_date?: string | null
          location?: string | null
          profile_id: string
          qualification?: string | null
          specialization?: string | null
          trainer_code: string
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          experience_years?: number | null
          id?: string
          joining_date?: string | null
          location?: string | null
          profile_id?: string
          qualification?: string | null
          specialization?: string | null
          trainer_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      enrollment_fee_summary: {
        Row: {
          batch_id: string | null
          course_id: string | null
          currency: string | null
          enrollment_id: string | null
          fee_amount: number | null
          last_payment_date: string | null
          outstanding_amount: number | null
          paid_amount: number | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_batch_id_course_id_fkey"
            columns: ["batch_id", "course_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id", "course_id"]
          },
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_export_view"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_export_view: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"] | null
          address: string | null
          admission_date: string | null
          city: string | null
          created_at: string | null
          date_of_birth: string | null
          education: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string | null
          gender: Database["public"]["Enums"]["gender"] | null
          phone: string | null
          pincode: string | null
          state: string | null
          student_code: string | null
          student_id: string | null
        }
        Relationships: []
      }
      trainer_export_view: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"] | null
          created_at: string | null
          email: string | null
          experience_years: number | null
          full_name: string | null
          joining_date: string | null
          location: string | null
          phone: string | null
          qualification: string | null
          specialization: string | null
          trainer_code: string | null
          trainer_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_set_account_status: {
        Args: {
          _profile_id: string
          _status: Database["public"]["Enums"]["account_status"]
        }
        Returns: undefined
      }
      bootstrap_first_admin: {
        Args: { _email: string; _full_name: string; _user_id: string }
        Returns: undefined
      }
      check_profile_role_consistency: {
        Args: { _profile_id: string }
        Returns: undefined
      }
      claim_due_deliveries: {
        Args: { _limit: number }
        Returns: {
          attempts: number
          channel: Database["public"]["Enums"]["delivery_channel"]
          created_at: string
          id: string
          last_error: string | null
          next_attempt_at: string
          notification_id: string
          provider_ref: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      class_tutor_names: {
        Args: { _class_ids: string[] }
        Returns: {
          class_id: string
          tutor_name: string
        }[]
      }
      first_admin_bootstrap_available: { Args: never; Returns: boolean }
      grade_assessment_answer: {
        Args: { _answer_id: string; _feedback: string; _marks: number }
        Returns: undefined
      }
      grade_submission_answer: {
        Args: { _answer_id: string; _feedback: string; _marks: number }
        Returns: undefined
      }
      mark_password_changed: {
        Args: { _profile_id: string }
        Returns: undefined
      }
      next_account_code: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: string
      }
      notify_admin_daily_welcome: {
        Args: { _admin_id: string }
        Returns: undefined
      }
      provision_account: {
        Args: {
          _actor: string
          _details: Json
          _email: string
          _full_name: string
          _phone: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      run_assignment_due_reminders: { Args: never; Returns: number }
      run_class_reminders: { Args: never; Returns: number }
      start_assessment_attempt: {
        Args: { _assessment_id: string }
        Returns: {
          assessment_id: string
          created_at: string
          deadline_at: string
          id: string
          max_score: number
          score: number | null
          started_at: string
          status: Database["public"]["Enums"]["assessment_attempt_status"]
          student_id: string
          submitted_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "assessment_attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_assessment_attempt: {
        Args: { _answers: Json; _attempt_id: string }
        Returns: {
          assessment_id: string
          created_at: string
          deadline_at: string
          id: string
          max_score: number
          score: number | null
          started_at: string
          status: Database["public"]["Enums"]["assessment_attempt_status"]
          student_id: string
          submitted_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "assessment_attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_assignment_answers: {
        Args: { _answers: Json; _assignment_id: string }
        Returns: {
          assignment_id: string
          created_at: string
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          score: number | null
          status: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at: string | null
          text_content: string | null
          updated_at: string
          url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      account_status: "active" | "inactive"
      announcement_audience: "all_students" | "all_trainers" | "specific_batch"
      announcement_priority: "info" | "success" | "warning" | "urgent"
      announcement_status: "draft" | "published" | "unpublished" | "expired"
      app_role: "admin" | "trainer" | "student"
      assessment_access_mode: "course" | "restricted"
      assessment_attempt_status: "in_progress" | "submitted" | "graded"
      assessment_question_type:
        | "single_choice"
        | "multiple_select"
        | "true_false"
        | "short_answer"
      assessment_status: "draft" | "published" | "closed"
      assignment_question_type:
        | "single_choice"
        | "multiple_select"
        | "true_false"
        | "short_answer"
        | "coding"
      assignment_status: "draft" | "published" | "closed" | "archived"
      attendance_source: "manual" | "automatic"
      attendance_status: "present" | "absent" | "late" | "excused"
      batch_status: "draft" | "active" | "completed" | "cancelled" | "archived"
      certificate_status: "issued" | "revoked"
      certificate_type: "course" | "internship"
      class_status:
        | "scheduled"
        | "live"
        | "processing"
        | "completed"
        | "cancelled"
      class_type: "online" | "offline" | "hybrid"
      content_status: "draft" | "published" | "archived"
      course_level: "beginner" | "intermediate" | "advanced" | "all_levels"
      delivery_channel: "email" | "push"
      delivery_status: "pending" | "sent" | "failed" | "skipped"
      enrollment_status:
        | "active"
        | "completed"
        | "transferred"
        | "removed"
        | "cancelled"
      gender: "female" | "male" | "other" | "prefer_not_to_say"
      integration_kind:
        | "ai"
        | "email"
        | "push"
        | "payments"
        | "calendar"
        | "video"
      integration_state: "not_configured" | "configured" | "error" | "disabled"
      internship_status: "planned" | "ongoing" | "completed" | "cancelled"
      payment_method: "cash" | "upi" | "bank_transfer" | "card" | "other"
      payment_status: "pending" | "partially_paid" | "paid"
      recording_source: "external" | "storage" | "zoho"
      resource_type: "video" | "document" | "link" | "download"
      submission_status: "pending" | "submitted" | "under_review" | "graded"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: ["active", "inactive"],
      announcement_audience: ["all_students", "all_trainers", "specific_batch"],
      announcement_priority: ["info", "success", "warning", "urgent"],
      announcement_status: ["draft", "published", "unpublished", "expired"],
      app_role: ["admin", "trainer", "student"],
      assessment_access_mode: ["course", "restricted"],
      assessment_attempt_status: ["in_progress", "submitted", "graded"],
      assessment_question_type: [
        "single_choice",
        "multiple_select",
        "true_false",
        "short_answer",
      ],
      assessment_status: ["draft", "published", "closed"],
      assignment_question_type: [
        "single_choice",
        "multiple_select",
        "true_false",
        "short_answer",
        "coding",
      ],
      assignment_status: ["draft", "published", "closed", "archived"],
      attendance_source: ["manual", "automatic"],
      attendance_status: ["present", "absent", "late", "excused"],
      batch_status: ["draft", "active", "completed", "cancelled", "archived"],
      certificate_status: ["issued", "revoked"],
      certificate_type: ["course", "internship"],
      class_status: [
        "scheduled",
        "live",
        "processing",
        "completed",
        "cancelled",
      ],
      class_type: ["online", "offline", "hybrid"],
      content_status: ["draft", "published", "archived"],
      course_level: ["beginner", "intermediate", "advanced", "all_levels"],
      delivery_channel: ["email", "push"],
      delivery_status: ["pending", "sent", "failed", "skipped"],
      enrollment_status: [
        "active",
        "completed",
        "transferred",
        "removed",
        "cancelled",
      ],
      gender: ["female", "male", "other", "prefer_not_to_say"],
      integration_kind: [
        "ai",
        "email",
        "push",
        "payments",
        "calendar",
        "video",
      ],
      integration_state: ["not_configured", "configured", "error", "disabled"],
      internship_status: ["planned", "ongoing", "completed", "cancelled"],
      payment_method: ["cash", "upi", "bank_transfer", "card", "other"],
      payment_status: ["pending", "partially_paid", "paid"],
      recording_source: ["external", "storage", "zoho"],
      resource_type: ["video", "document", "link", "download"],
      submission_status: ["pending", "submitted", "under_review", "graded"],
    },
  },
} as const
