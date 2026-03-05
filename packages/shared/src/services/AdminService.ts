import { getSupabase } from './supabase';
import type { Question, QuestionLie } from '../types';
import type { GameAudioCueKey } from '../constants/audioCues';

export interface AdminUser {
  id: string;
  display_name: string | null;
  is_admin: boolean;
  is_approved: boolean;
  is_banned: boolean;
  is_paid_host: boolean;
  subscription_tier: string;
  games_created_count: number;
  created_at: string;
  // Email from auth.users (joined)
  email?: string;
}

export interface QuestionInput {
  question_text: string;
  correct_answer: string;
  category?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  language: 'ar' | 'en';
}

export interface QuestionFilters {
  search?: string;
  category?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  language?: 'ar' | 'en';
}

export interface GameAudioCue {
  id: string;
  cue_key: GameAudioCueKey;
  label: string;
  audio_url: string | null;
  duration_ms: number | null;
  is_active: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export const AdminService = {
  /**
   * Check if the current user is an approved admin
   */
  async isAdmin(): Promise<boolean> {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return false;

    const { data, error } = await supabase
      .from('host_profiles')
      .select('is_admin, is_approved')
      .eq('id', user.id)
      .single();

    if (error || !data) return false;
    
    return data.is_admin === true && data.is_approved === true;
  },

  /**
   * Check if user is admin but awaiting approval
   */
  async isAwaitingApproval(): Promise<boolean> {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return false;

    const { data, error } = await supabase
      .from('host_profiles')
      .select('is_admin, is_approved')
      .eq('id', user.id)
      .single();

    if (error || !data) return false;
    
    return data.is_admin === true && data.is_approved === false;
  },

  // ==================== QUESTION MANAGEMENT ====================

  /**
   * Get all questions with optional filters
   */
  async getQuestions(filters?: QuestionFilters): Promise<Question[]> {
    const supabase = getSupabase();
    
    let query = supabase
      .from('questions')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.search) {
      query = query.ilike('question_text', `%${filters.search}%`);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.difficulty) {
      query = query.eq('difficulty', filters.difficulty);
    }
    if (filters?.language) {
      query = query.eq('language', filters.language);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch questions:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Get all unique categories from questions
   */
  async getCategories(): Promise<string[]> {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('questions')
      .select('category')
      .not('category', 'is', null);

    if (error) {
      console.error('Failed to fetch categories:', error);
      return [];
    }

    // Get unique categories
    const categories = [...new Set(data?.map(q => q.category).filter(Boolean))] as string[];
    return categories.sort();
  },

  /**
   * Create a new question
   */
  async createQuestion(input: QuestionInput): Promise<Question> {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('questions')
      .insert({
        question_text: input.question_text,
        correct_answer: input.correct_answer,
        category: input.category || null,
        difficulty: input.difficulty,
        language: input.language,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create question:', error);
      throw error;
    }

    return data;
  },

  /**
   * Update an existing question
   */
  async updateQuestion(id: string, input: Partial<QuestionInput>): Promise<Question> {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('questions')
      .update({
        ...(input.question_text && { question_text: input.question_text }),
        ...(input.correct_answer && { correct_answer: input.correct_answer }),
        ...(input.category !== undefined && { category: input.category || null }),
        ...(input.difficulty && { difficulty: input.difficulty }),
        ...(input.language && { language: input.language }),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update question:', error);
      throw error;
    }

    return data;
  },

  /**
   * Delete a question
   */
  async deleteQuestion(id: string): Promise<void> {
    const supabase = getSupabase();
    
    const { error } = await supabase
      .from('questions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Failed to delete question:', error);
      throw error;
    }
  },

  /**
   * Bulk import questions
   */
  async bulkImportQuestions(questions: QuestionInput[]): Promise<{ success: number; failed: number }> {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('questions')
      .insert(questions.map(q => ({
        question_text: q.question_text,
        correct_answer: q.correct_answer,
        category: q.category || null,
        difficulty: q.difficulty,
        language: q.language,
      })))
      .select();

    if (error) {
      console.error('Bulk import failed:', error);
      return { success: 0, failed: questions.length };
    }

    return { success: data?.length || 0, failed: questions.length - (data?.length || 0) };
  },

  // ==================== LLM GENERATION ====================

  /**
   * Generate questions via LLM (admin only)
   * Returns generated questions for preview — NOT auto-inserted into DB
   */
  async generateQuestions(params: {
    category: string;
    count: number;
    difficulty: 'easy' | 'medium' | 'hard';
  }): Promise<{ questions: Array<{ question_text: string; correct_answer: string }>; provider: string }> {
    const supabase = getSupabase();

    const { data, error } = await supabase.functions.invoke('generate-content', {
      body: {
        action: 'generate-questions',
        category: params.category,
        count: params.count,
        difficulty: params.difficulty,
      },
    });

    if (error) {
      console.error('Failed to generate questions:', error);
      throw new Error(error.message || 'فشل في إنشاء الأسئلة');
    }

    if (!data?.success) {
      throw new Error(data?.error || 'فشل في إنشاء الأسئلة');
    }

    return { questions: data.questions, provider: data.provider };
  },

  /**
   * Generate lies for a question via LLM (admin only)
   * Lies are inserted into question_lies table and returned for preview
   */
  async generateLies(params: {
    question_id: string;
    question_text: string;
    correct_answer: string;
    count: number;
  }): Promise<{ lies: string[]; inserted: number; provider: string }> {
    const supabase = getSupabase();

    const { data, error } = await supabase.functions.invoke('generate-content', {
      body: {
        action: 'generate-lies',
        question_id: params.question_id,
        question_text: params.question_text,
        correct_answer: params.correct_answer,
        count: params.count,
      },
    });

    if (error) {
      console.error('Failed to generate lies:', error);
      throw new Error(error.message || 'فشل في إنشاء الإجابات المضللة');
    }

    if (!data?.success) {
      throw new Error(data?.error || 'فشل في إنشاء الإجابات المضللة');
    }

    return { lies: data.lies, inserted: data.inserted, provider: data.provider };
  },

  // ==================== QUESTION LIES MANAGEMENT ====================

  /**
   * Get all lies for a specific question
   */
  async getQuestionLies(questionId: string): Promise<QuestionLie[]> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('question_lies')
      .select('*')
      .eq('question_id', questionId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch question lies:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Delete a specific lie
   */
  async deleteQuestionLie(lieId: string): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
      .from('question_lies')
      .delete()
      .eq('id', lieId);

    if (error) {
      console.error('Failed to delete lie:', error);
      throw error;
    }
  },

  /**
   * Manually add a lie for a question
   */
  async addQuestionLie(questionId: string, lieText: string): Promise<QuestionLie> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('question_lies')
      .insert({
        question_id: questionId,
        lie_text: lieText,
        source: 'manual',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to add lie:', error);
      throw error;
    }

    return data;
  },

  /**
   * Get lie counts for multiple questions (for table indicator)
   */
  async getQuestionLieCounts(questionIds: string[]): Promise<Record<string, number>> {
    if (questionIds.length === 0) return {};

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('question_lies')
      .select('question_id')
      .in('question_id', questionIds);

    if (error) {
      console.error('Failed to fetch lie counts:', error);
      return {};
    }

    const counts: Record<string, number> = {};
    for (const row of data || []) {
      counts[row.question_id] = (counts[row.question_id] || 0) + 1;
    }
    return counts;
  },

  // ==================== USER MANAGEMENT ====================

  /**
   * Get all users (host_profiles)
   */
  async getUsers(): Promise<AdminUser[]> {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('host_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch users:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Ban a user
   */
  async banUser(userId: string): Promise<void> {
    const supabase = getSupabase();
    
    const { error } = await supabase
      .from('host_profiles')
      .update({ is_banned: true })
      .eq('id', userId);

    if (error) {
      console.error('Failed to ban user:', error);
      throw error;
    }
  },

  /**
   * Unban a user
   */
  async unbanUser(userId: string): Promise<void> {
    const supabase = getSupabase();
    
    const { error } = await supabase
      .from('host_profiles')
      .update({ is_banned: false })
      .eq('id', userId);

    if (error) {
      console.error('Failed to unban user:', error);
      throw error;
    }
  },

  /**
   * Update user display name
   */
  async updateUserDisplayName(userId: string, displayName: string): Promise<void> {
    const supabase = getSupabase();
    
    const { error } = await supabase
      .from('host_profiles')
      .update({ display_name: displayName })
      .eq('id', userId);

    if (error) {
      console.error('Failed to update user display name:', error);
      throw error;
    }
  },

  // ==================== TV AUDIO CUES MANAGEMENT ====================

  /**
   * Get all configured TV audio cues.
   */
  async getGameAudioCues(): Promise<GameAudioCue[]> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('game_audio_cues')
      .select('*')
      .order('cue_key', { ascending: true });

    if (error) {
      console.error('Failed to fetch game audio cues:', error);
      throw error;
    }

    return (data || []) as GameAudioCue[];
  },

  /**
   * Upload audio file to storage and return a public URL.
   */
  async uploadGameAudioFile(file: File, cueKey: GameAudioCueKey): Promise<string> {
    const supabase = getSupabase();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${cueKey}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase
      .storage
      .from('game-audio-cues')
      .upload(path, file, {
        upsert: false,
        cacheControl: '3600',
        contentType: file.type || 'audio/mpeg',
      });

    if (uploadError) {
      console.error('Failed to upload game audio file:', uploadError);
      throw uploadError;
    }

    const { data } = supabase.storage.from('game-audio-cues').getPublicUrl(path);
    if (!data?.publicUrl) {
      throw new Error('Failed to get public URL for uploaded audio');
    }

    return data.publicUrl;
  },

  /**
   * Create/update a single cue configuration row.
   */
  async upsertGameAudioCue(input: {
    cue_key: GameAudioCueKey;
    label: string;
    audio_url: string | null;
    duration_ms?: number | null;
    is_active?: boolean;
  }): Promise<GameAudioCue> {
    const supabase = getSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const updatedBy = authData.user?.id || null;

    const { data, error } = await supabase
      .from('game_audio_cues')
      .upsert({
        cue_key: input.cue_key,
        label: input.label,
        audio_url: input.audio_url,
        duration_ms: input.duration_ms ?? null,
        is_active: input.is_active ?? true,
        updated_by: updatedBy,
      }, { onConflict: 'cue_key' })
      .select()
      .single();

    if (error) {
      console.error('Failed to upsert game audio cue:', error);
      throw error;
    }

    return data as GameAudioCue;
  },

  /**
   * Remove assigned audio for a cue key (keeps cue row).
   */
  async clearGameAudioCue(cueKey: GameAudioCueKey): Promise<void> {
    const supabase = getSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const updatedBy = authData.user?.id || null;

    const { error } = await supabase
      .from('game_audio_cues')
      .update({
        audio_url: null,
        duration_ms: null,
        updated_by: updatedBy,
      })
      .eq('cue_key', cueKey);

    if (error) {
      console.error('Failed to clear game audio cue:', error);
      throw error;
    }
  },
};
