// Supabase Edge Function: LLM Content Generation
// Handles Arabic question generation and lie generation for admin panel
// Uses Gemini (primary) with Groq fallback via provider-agnostic abstraction

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateWithFallback } from '../_shared/llm-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer',
};

// ============================================================================
// PROMPTS
// ============================================================================

const QUESTION_SYSTEM_PROMPT = `أنت منشئ أسئلة لعبة ثقافية عربية من نوع "فيبج" (Fibbage). مهمتك إنشاء أسئلة تثقيفية ممتعة مع إجاباتها الصحيحة.

القواعد:
- الأسئلة يجب أن تكون واضحة ومحددة بحيث يكون لها إجابة واحدة صحيحة فقط
- الإجابات يجب أن تكون قصيرة (كلمة واحدة إلى 5 كلمات كحد أقصى)
- الإجابات يجب أن تكون حقائق يمكن التحقق منها
- لا تكرر أسئلة شائعة جداً ومعروفة
- يجب أن تكون الأسئلة مناسبة لجميع الأعمار
- اكتب بالعربية الفصحى البسيطة
- أجب بصيغة JSON فقط بدون أي نص إضافي`;

const LIE_SYSTEM_PROMPT = `أنت مساعد في لعبة أسئلة وأجوبة عربية شبيهة بلعبة "فيبج" (Fibbage). مهمتك هي إنشاء إجابات مضللة (كاذبة) لكنها تبدو معقولة ومقنعة.

القواعد:
- يجب أن تكون الإجابات المضللة بنفس أسلوب وطول الإجابة الصحيحة
- يجب أن تكون الإجابات منطقية ومعقولة لكنها خاطئة
- استخدم نفس البنية اللغوية للإجابة الصحيحة (إذا كانت رقماً، اكتب رقماً. إذا كانت اسماً، اكتب اسماً. إذا كانت تاريخاً، اكتب تاريخاً)
- الردود يجب أن تكون باللغة العربية فقط
- لا تضف علامات ترقيم أو شرح إضافي أو ترقيم
- اكتب كل إجابة في سطر منفصل بدون أي إضافات`;

// ============================================================================
// HANDLERS
// ============================================================================

interface GenerateQuestionsRequest {
  action: 'generate-questions';
  category: string;
  count: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface GenerateLiesRequest {
  action: 'generate-lies';
  question_id: string;
  question_text: string;
  correct_answer: string;
  count: number;
}

interface GeneratedQuestion {
  question_text: string;
  correct_answer: string;
}

async function handleGenerateQuestions(
  params: GenerateQuestionsRequest
): Promise<{ questions: GeneratedQuestion[]; provider: string }> {
  const count = Math.min(Math.max(params.count || 5, 1), 20);

  const difficultyMap: Record<string, string> = {
    easy: 'سهل',
    medium: 'متوسط',
    hard: 'صعب',
  };

  const userPrompt = `أنشئ ${count} سؤال في فئة "${params.category}" بمستوى صعوبة "${difficultyMap[params.difficulty] || 'متوسط'}".

أجب بصيغة JSON فقط كالتالي (بدون أي نص قبل أو بعد):
[
  {
    "question_text": "نص السؤال",
    "correct_answer": "الإجابة الصحيحة"
  }
]`;

  const { text, provider } = await generateWithFallback(
    QUESTION_SYSTEM_PROMPT,
    userPrompt,
    0.6
  );

  // Parse JSON from LLM response (handle markdown code blocks)
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  let questions: GeneratedQuestion[];
  try {
    questions = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${cleaned.substring(0, 200)}`);
  }

  if (!Array.isArray(questions)) {
    throw new Error('LLM response is not an array');
  }

  // Validate and filter
  questions = questions
    .filter(
      (q) =>
        q &&
        typeof q.question_text === 'string' &&
        typeof q.correct_answer === 'string' &&
        q.question_text.trim().length > 0 &&
        q.correct_answer.trim().length > 0
    )
    .map((q) => ({
      question_text: q.question_text.trim(),
      correct_answer: q.correct_answer.trim(),
    }));

  return { questions, provider };
}

async function handleGenerateLies(
  params: GenerateLiesRequest,
  supabase: any
): Promise<{ lies: string[]; inserted: number; provider: string }> {
  const count = Math.min(Math.max(params.count || 3, 1), 5);

  // Get existing lies for this question to avoid duplicates
  const { data: existingLies } = await supabase
    .from('question_lies')
    .select('lie_text')
    .eq('question_id', params.question_id);

  const existingTexts = (existingLies || []).map(
    (l: { lie_text: string }) => l.lie_text
  );

  const existingList =
    existingTexts.length > 0
      ? `\nالإجابات المضللة الموجودة مسبقاً (لا تكررها): ${existingTexts.join('، ')}`
      : '';

  const userPrompt = `السؤال: ${params.question_text}
الإجابة الصحيحة: ${params.correct_answer}${existingList}

أنشئ ${count} إجابات مضللة مقنعة. اكتب كل إجابة في سطر منفصل بدون ترقيم:`;

  const { text, provider } = await generateWithFallback(
    LIE_SYSTEM_PROMPT,
    userPrompt,
    0.8
  );

  // Parse lies (one per line)
  let lies = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    // Remove any numbering artifacts (e.g., "1. ", "- ")
    .map((line) => line.replace(/^[\d٠-٩]+[.)]\s*/, '').replace(/^[-•]\s*/, '').trim())
    .filter((line) => line.length > 0);

  // Deduplicate against existing lies and correct answer
  const normalizedExisting = new Set(
    [...existingTexts, params.correct_answer].map((t) =>
      t.trim().toLocaleLowerCase()
    )
  );
  lies = lies.filter(
    (lie) => !normalizedExisting.has(lie.toLocaleLowerCase())
  );

  // Insert into question_lies table
  let inserted = 0;
  if (lies.length > 0) {
    const rows = lies.map((lie_text) => ({
      question_id: params.question_id,
      lie_text,
      source: 'ai',
    }));

    const { data, error } = await supabase
      .from('question_lies')
      .upsert(rows, { onConflict: 'question_id,lie_text', ignoreDuplicates: true })
      .select();

    if (error) {
      console.error('Error inserting lies:', error);
    } else {
      inserted = data?.length || 0;
    }
  }

  return { lies, inserted, provider };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is an admin via their JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid auth token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Check admin status
    const { data: profile } = await supabase
      .from('host_profiles')
      .select('is_admin, is_approved')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin || !profile?.is_approved) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // Parse request
    const body = await req.json();
    const { action } = body;

    let result: any;

    switch (action) {
      case 'generate-questions':
        result = await handleGenerateQuestions(body as GenerateQuestionsRequest);
        break;

      case 'generate-lies':
        result = await handleGenerateLies(body as GenerateLiesRequest, supabase);
        break;

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('generate-content error:', error);

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

/*
 * DEPLOYMENT INSTRUCTIONS:
 *
 * 1. Set environment variables in Supabase Dashboard → Edge Functions → Secrets:
 *    - GEMINI_API_KEY: Get from https://aistudio.google.com/apikey
 *    - GROQ_API_KEY: Get from https://console.groq.com/keys
 *    - LLM_PRIMARY_PROVIDER: "gemini" (default) or "groq"
 *
 * 2. Deploy:
 *    supabase functions deploy generate-content
 *
 * 3. Test:
 *    curl -X POST https://<project>.supabase.co/functions/v1/generate-content \
 *      -H "Authorization: Bearer <admin-jwt>" \
 *      -H "Content-Type: application/json" \
 *      -d '{"action":"generate-questions","category":"كرة القدم","count":3,"difficulty":"medium"}'
 */
