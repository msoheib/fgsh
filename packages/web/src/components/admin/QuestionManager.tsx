import React, { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AdminService, type Question, type QuestionInput, type QuestionFilters, type QuestionLie } from '@fakash/shared';
import { GradientButton } from '../GradientButton';
import { LoadingSpinner } from '../LoadingSpinner';
import toast from 'react-hot-toast';

interface EditingQuestion extends QuestionInput {
  id?: string;
}

interface GeneratedQuestion {
  question_text: string;
  correct_answer: string;
  _excluded?: boolean; // Admin marks for removal before import
}

type CategorySortDirection = 'none' | 'asc' | 'desc';
type CsvDifficulty = QuestionInput['difficulty'];
type CsvLanguage = QuestionInput['language'];

interface CsvParseResult {
  questions: QuestionInput[];
  errors: string[];
}

const CSV_TEMPLATE_HEADERS = [
  'question_text',
  'correct_answer',
  'category',
  'difficulty',
  'language',
] as const;

const DIFFICULTY_LABELS = {
  easy: 'سهل',
  medium: 'متوسط',
  hard: 'صعب',
};

const LANGUAGE_LABELS = {
  ar: 'عربي',
  en: 'إنجليزي',
};

const ALLOWED_CSV_DIFFICULTIES: CsvDifficulty[] = ['easy', 'medium', 'hard'];
const ALLOWED_CSV_LANGUAGES: CsvLanguage[] = ['ar', 'en'];

const ModalBackdrop: React.FC<{ children: ReactNode }> = ({ children }) => {
  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4">
      {children}
    </div>,
    document.body
  );
};

export const QuestionManager: React.FC = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<EditingQuestion | null>(null);
  const [filters, setFilters] = useState<QuestionFilters>({});
  const [categorySort, setCategorySort] = useState<CategorySortDirection>('none');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [uploadPreview, setUploadPreview] = useState<QuestionInput[] | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Generation state
  const [showAIGenerateModal, setShowAIGenerateModal] = useState(false);
  const [aiCategory, setAiCategory] = useState('');
  const [aiCount, setAiCount] = useState(5);
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPreview, setAiPreview] = useState<GeneratedQuestion[] | null>(null);

  // Lies management state
  const [showLiesModal, setShowLiesModal] = useState(false);
  const [liesQuestion, setLiesQuestion] = useState<Question | null>(null);
  const [questionLies, setQuestionLies] = useState<QuestionLie[]>([]);
  const [liesLoading, setLiesLoading] = useState(false);
  const [liesGenerating, setLiesGenerating] = useState(false);
  const [lieCounts, setLieCounts] = useState<Record<string, number>>({});
  const [newLieText, setNewLieText] = useState('');
  const [aiLieCount, setAiLieCount] = useState(3);
  const anyModalOpen = showModal || !!showDeleteConfirm || showBulkDeleteConfirm || showUploadModal || showAIGenerateModal || showLiesModal;
  const selectedQuestionCount = selectedQuestionIds.size;
  const sortedQuestions = useMemo(() => {
    if (categorySort === 'none') {
      return questions;
    }

    return [...questions].sort((a, b) => {
      const aCategory = a.category?.trim() || '';
      const bCategory = b.category?.trim() || '';

      if (!aCategory && bCategory) return 1;
      if (aCategory && !bCategory) return -1;
      if (!aCategory && !bCategory) {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }

      const categoryComparison = aCategory.localeCompare(bCategory, 'ar', { sensitivity: 'base' });
      if (categoryComparison !== 0) {
        return categorySort === 'asc' ? categoryComparison : -categoryComparison;
      }

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [categorySort, questions]);

  useEffect(() => {
    setSelectedQuestionIds(new Set());
    setShowBulkDeleteConfirm(false);
    loadQuestions();
    loadCategories();
  }, [filters]);

  // Load lie counts whenever questions change
  useEffect(() => {
    if (questions.length > 0) {
      loadLieCounts();
    } else {
      setLieCounts({});
    }
  }, [questions]);

  useEffect(() => {
    if (!anyModalOpen || typeof document === 'undefined') {
      return;
    }

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
    };
  }, [anyModalOpen]);

  const loadQuestions = async () => {
    setLoading(true);
    setSelectedQuestionIds(new Set());
    setShowBulkDeleteConfirm(false);
    try {
      const data = await AdminService.getQuestions(filters);
      setQuestions(data);
    } catch (error) {
      toast.error('فشل في تحميل الأسئلة');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await AdminService.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadLieCounts = async () => {
    try {
      const ids = questions.map((q) => q.id);
      const counts = await AdminService.getQuestionLieCounts(ids);
      setLieCounts(counts);
    } catch (error) {
      console.error('Failed to load lie counts:', error);
    }
  };

  const handleAddNew = () => {
    setEditingQuestion({
      question_text: '',
      correct_answer: '',
      category: '',
      difficulty: 'medium',
      language: 'ar',
    });
    setShowModal(true);
  };

  const handleEdit = (question: Question) => {
    setEditingQuestion({
      id: question.id,
      question_text: question.question_text,
      correct_answer: question.correct_answer,
      category: question.category || '',
      difficulty: question.difficulty,
      language: question.language,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editingQuestion) return;

    if (!editingQuestion.question_text.trim() || !editingQuestion.correct_answer.trim()) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    try {
      if (editingQuestion.id) {
        await AdminService.updateQuestion(editingQuestion.id, editingQuestion);
        toast.success('تم تحديث السؤال بنجاح');
      } else {
        await AdminService.createQuestion(editingQuestion);
        toast.success('تمت إضافة السؤال بنجاح');
      }
      setShowModal(false);
      setEditingQuestion(null);
      loadQuestions();
      loadCategories();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'حدث خطأ أثناء الحفظ');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await AdminService.deleteQuestion(id);
      toast.success('تمت إزالة السؤال من الجولات الجديدة');
      setShowDeleteConfirm(null);
      loadQuestions();
      loadCategories();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'حدث خطأ أثناء الحذف');
    }
  };

  const handleCategorySortToggle = () => {
    setCategorySort((current) => (current === 'asc' ? 'desc' : 'asc'));
  };

  const toggleQuestionSelection = (id: string) => {
    setSelectedQuestionIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearQuestionSelection = () => {
    setSelectedQuestionIds(new Set());
    setShowBulkDeleteConfirm(false);
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedQuestionIds);
    if (ids.length === 0) {
      setShowBulkDeleteConfirm(false);
      return;
    }

    try {
      const result = await AdminService.deleteQuestions(ids);
      toast.success(`تمت إزالة ${result.deleted} سؤال من الجولات الجديدة`);
      setShowBulkDeleteConfirm(false);
      setSelectedQuestionIds(new Set());
      loadQuestions();
      loadCategories();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'حدث خطأ أثناء الحذف');
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        let parsed: QuestionInput[];
        let parseErrors: string[] = [];

        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.json')) {
          parsed = JSON.parse(content);
        } else if (fileName.endsWith('.csv')) {
          const result = parseCSV(content);
          parsed = result.questions;
          parseErrors = result.errors;
        } else if (fileName.endsWith('.txt')) {
          parsed = parseTXT(content);
        } else {
          toast.error('يرجى رفع ملف CSV أو JSON أو TXT');
          return;
        }

        // Validate parsed data
        const validQuestions = parsed.filter(
          (q) => q.question_text && q.correct_answer && q.difficulty && q.language
        );

        if (validQuestions.length === 0) {
          toast.error(parseErrors[0] || 'لم يتم العثور على أسئلة صالحة في الملف');
          return;
        }

        setUploadPreview(validQuestions);
        setUploadErrors(parseErrors);
        setShowUploadModal(true);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'حدث خطأ في قراءة الملف');
      }
    };
    reader.readAsText(file);
  };

  const parseCSVRows = (content: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let value = '';
    let inQuotes = false;

    for (let i = 0; i < content.length; i += 1) {
      const char = content[i];
      const nextChar = content[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          value += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === ',' && !inQuotes) {
        row.push(value.trim());
        value = '';
        continue;
      }

      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i += 1;
        }
        row.push(value.trim());
        if (row.some((cell) => cell.length > 0)) {
          rows.push(row);
        }
        row = [];
        value = '';
        continue;
      }

      value += char;
    }

    if (inQuotes) {
      throw new Error('ملف CSV يحتوي على علامة اقتباس غير مغلقة');
    }

    row.push(value.trim());
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }

    return rows;
  };

  const normalizeCsvHeader = (value: string) => value.replace(/^\uFEFF/, '').trim().toLowerCase();

  const parseCSV = (content: string): CsvParseResult => {
    const rows = parseCSVRows(content);

    if (rows.length === 0) {
      throw new Error('ملف CSV فارغ');
    }

    const headers = rows[0].map(normalizeCsvHeader);
    const requiredHeaders = ['question_text', 'correct_answer', 'category'];
    const allowedHeaders = new Set<string>(CSV_TEMPLATE_HEADERS);
    const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
    const unknownHeaders = headers.filter((header) => header && !allowedHeaders.has(header));

    if (missingHeaders.length > 0) {
      throw new Error(`أعمدة CSV المطلوبة غير موجودة: ${missingHeaders.join(', ')}`);
    }

    if (unknownHeaders.length > 0) {
      throw new Error(`أسماء أعمدة CSV غير معروفة: ${unknownHeaders.join(', ')}`);
    }

    const questions: QuestionInput[] = [];
    const errors: string[] = [];

    rows.slice(1).forEach((row, rowIndex) => {
      const lineNumber = rowIndex + 2;
      const obj: Record<string, string> = {};
      headers.forEach((header, index) => {
        obj[header] = row[index]?.trim() || '';
      });

      const questionText = obj.question_text;
      const correctAnswer = obj.correct_answer;
      const category = obj.category;
      const difficultyRaw = (obj.difficulty || 'medium').toLowerCase();
      const languageRaw = (obj.language || 'ar').toLowerCase();

      if (!questionText) {
        errors.push(`السطر ${lineNumber}: question_text مطلوب`);
        return;
      }

      if (!correctAnswer) {
        errors.push(`السطر ${lineNumber}: correct_answer مطلوب`);
        return;
      }

      if (!category) {
        errors.push(`السطر ${lineNumber}: category مطلوب`);
        return;
      }

      if (!ALLOWED_CSV_DIFFICULTIES.includes(difficultyRaw as CsvDifficulty)) {
        errors.push(`السطر ${lineNumber}: difficulty يجب أن يكون easy أو medium أو hard`);
        return;
      }

      if (!ALLOWED_CSV_LANGUAGES.includes(languageRaw as CsvLanguage)) {
        errors.push(`السطر ${lineNumber}: language يجب أن يكون ar أو en`);
        return;
      }

      questions.push({
        question_text: questionText,
        correct_answer: correctAnswer,
        category,
        difficulty: difficultyRaw as CsvDifficulty,
        language: languageRaw as CsvLanguage,
      });
    });

    return { questions, errors };
  };

  const parseTXT = (content: string): QuestionInput[] => {
    const questions: QuestionInput[] = [];
    const lines = content.split('\n');
    let currentCategory = '';
    let currentQuestion = '';
    let i = 0;

    // Category header detection patterns (Arabic ordinals)
    const categoryPatterns = [
      /^(?:الاول|الأول)\s*[:\s]\s*(.+)/,
      /^(?:الثاني|الثانيه?)\s*[:\s]?\s*(.+)/,
      /^(?:الثالث|الثالثه?)\s*[:\s]?\s*(.+)/,
      /^(?:الرابع)\s*[:\s]?\s*(.+)/,
      /^(?:الخامس)\s*[:\s]?\s*(.+)/,
      /^(?:السادس)\s*[:\s]?\s*(.+)/,
      /^(?:السابع)\s*[:\s]?\s*(.+)/,
      /^(?:الثامن)\s*[:\s]?\s*(.+)/,
      /^(?:التاسع)\s*[:\s]?\s*(.+)/,
      /^(?:العاشر)\s*[:\s]?\s*(.+)/,
      /^(?:احدى عشر|أحد عشر|الحادي عشر)\s*[:\s]?\s*(.+)/,
      /^(?:اثنى عشر|اثني عشر|الثاني عشر)\s*[:\s]?\s*(.+)/,
      /^(?:ثلاثة? عشر|الثالث عشر)\s*[:\s]?\s*(.+)/,
    ];

    // Skip pattern for "(شيييل)" and variants
    const skipPattern = /شي+ل/;

    while (i < lines.length) {
      const line = lines[i].trim();

      // Skip empty lines and separators
      if (!line || /^[—_⸻\-]{3,}$/.test(line) || line === 'اسئله') {
        i++;
        continue;
      }

      // Check for category header
      let isCategory = false;
      for (const pattern of categoryPatterns) {
        const match = line.match(pattern);
        if (match) {
          currentCategory = match[1].replace(/[:\s]+$/, '').trim();
          isCategory = true;
          break;
        }
      }
      if (isCategory) { i++; continue; }

      // Check for numbered question start (e.g. "1.", "٤.", "\t1.\t")
      const questionMatch = line.match(/^[\t\s]*(?:\d+|[٠-٩]+)\s*[.)]\s*(.+)/);
      if (questionMatch) {
        currentQuestion = questionMatch[1].trim();
        i++;

        // Look ahead for answer in various formats
        let answer = '';
        let foundAnswer = false;

        while (i < lines.length) {
          const nextLine = lines[i].trim();

          // Format A: "الجواب: answer" or "🟠 الجواب الصحيح: answer"
          const jawabMatch = nextLine.match(/^(?:🟠\s*)?(?:الجواب|الجواب الصحيح)\s*:\s*(.+)/);
          if (jawabMatch) {
            answer = jawabMatch[1].trim();
            foundAnswer = true;
            i++;
            break;
          }

          // Format B: Multiple choice - line with ✅
          if (nextLine.includes('✅')) {
            const choiceMatch = nextLine.match(/[أ-ي]\)\s*(.+?)✅/);
            if (choiceMatch) {
              answer = choiceMatch[1].trim();
            } else {
              answer = nextLine.replace(/[•\t\s]*[أ-ي]\)\s*/, '').replace('✅', '').trim();
            }
            foundAnswer = true;
            // Continue scanning to skip remaining choices
            i++;
            while (i < lines.length && lines[i].trim().match(/^[•\t\s]*[أ-ي]\)/)) {
              i++;
            }
            break;
          }

          // Still a multiple choice option (no ✅) — skip
          if (nextLine.match(/^[•\t\s]*[أ-ي]\)/)) {
            i++;
            continue;
          }

          // Misleading options line — skip
          if (nextLine.startsWith('(خيارات مضلّلة') || nextLine.startsWith('(خيارات')) {
            i++;
            continue;
          }

          // Empty line — keep looking (answers often follow blank line)
          if (!nextLine) {
            i++;
            continue;
          }

          // Next numbered question or category — stop looking
          if (nextLine.match(/^[\t\s]*(?:\d+|[٠-٩]+)\s*[.)]\s*/) ||
              categoryPatterns.some(p => p.test(nextLine)) ||
              /^[—_⸻\-]{3,}$/.test(nextLine)) {
            break;
          }

          // Could be a continuation of the question text
          if (!nextLine.match(/^(?:🟠|الجواب)/)) {
            currentQuestion += ' ' + nextLine;
          }

          i++;
        }

        if (foundAnswer && answer) {
          // Check skip marker
          if (skipPattern.test(answer)) {
            continue;
          }
          // Clean parenthetical notes from answer
          answer = answer.replace(/\s*\(.*?\)\s*$/, '').trim();
          // Clean trailing punctuation artifacts
          answer = answer.replace(/[!.]+$/, '').trim();

          if (currentQuestion && answer) {
            questions.push({
              question_text: currentQuestion,
              correct_answer: answer,
              category: currentCategory || undefined,
              difficulty: 'medium',
              language: 'ar',
            });
          }
        }
        continue;
      }

      i++;
    }

    return questions;
  };

  const handleBulkImport = async () => {
    if (!uploadPreview) return;

    try {
      const result = await AdminService.bulkImportQuestions(uploadPreview);
      toast.success(`تم استيراد ${result.success} سؤال بنجاح`);
      if (result.failed > 0) {
        toast.error(`فشل استيراد ${result.failed} سؤال`);
      }
      setShowUploadModal(false);
      setUploadPreview(null);
      setUploadErrors([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      loadQuestions();
      loadCategories();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'حدث خطأ أثناء الاستيراد');
    }
  };

  // ==================== AI Question Generation ====================

  const handleAIGenerate = async () => {
    if (!aiCategory.trim()) {
      toast.error('يرجى كتابة الفئة');
      return;
    }

    setAiGenerating(true);
    try {
      const { questions: generated } = await AdminService.generateQuestions({
        category: aiCategory.trim(),
        count: aiCount,
        difficulty: aiDifficulty,
      });
      setAiPreview(generated.map((q) => ({ ...q, _excluded: false })));
      toast.success(`تم إنشاء ${generated.length} سؤال`);
    } catch (error: any) {
      toast.error(error.message || 'فشل في إنشاء الأسئلة');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleAIImport = async () => {
    if (!aiPreview) return;

    const toImport = aiPreview.filter((q) => !q._excluded);
    if (toImport.length === 0) {
      toast.error('لا توجد أسئلة للاستيراد');
      return;
    }

    try {
      const result = await AdminService.bulkImportQuestions(
        toImport.map((q) => ({
          question_text: q.question_text,
          correct_answer: q.correct_answer,
          category: aiCategory.trim(),
          difficulty: aiDifficulty,
          language: 'ar' as const,
        }))
      );
      toast.success(`تم استيراد ${result.success} سؤال بنجاح`);
      setShowAIGenerateModal(false);
      setAiPreview(null);
      setAiCategory('');
      loadQuestions();
      loadCategories();
    } catch (error) {
      toast.error('حدث خطأ أثناء الاستيراد');
    }
  };

  // ==================== Lies Management ====================

  const handleOpenLies = async (question: Question) => {
    setLiesQuestion(question);
    setShowLiesModal(true);
    setLiesLoading(true);
    try {
      const lies = await AdminService.getQuestionLies(question.id);
      setQuestionLies(lies);
    } catch (error) {
      toast.error('فشل في تحميل الإجابات المضللة');
    } finally {
      setLiesLoading(false);
    }
  };

  const handleGenerateLies = async () => {
    if (!liesQuestion) return;

    setLiesGenerating(true);
    try {
      const { lies, inserted } = await AdminService.generateLies({
        question_id: liesQuestion.id,
        question_text: liesQuestion.question_text,
        correct_answer: liesQuestion.correct_answer,
        count: aiLieCount,
      });
      toast.success(`تم إنشاء ${lies.length} إجابة مضللة (${inserted} جديدة)`);
      const updated = await AdminService.getQuestionLies(liesQuestion.id);
      setQuestionLies(updated);
      loadLieCounts();
    } catch (error: any) {
      toast.error(error.message || 'فشل في إنشاء الإجابات المضللة');
    } finally {
      setLiesGenerating(false);
    }
  };

  const handleAddManualLie = async () => {
    if (!liesQuestion || !newLieText.trim()) return;

    try {
      await AdminService.addQuestionLie(liesQuestion.id, newLieText.trim());
      toast.success('تمت إضافة الإجابة المضللة');
      setNewLieText('');
      const updated = await AdminService.getQuestionLies(liesQuestion.id);
      setQuestionLies(updated);
      loadLieCounts();
    } catch (error) {
      toast.error('فشل في إضافة الإجابة المضللة');
    }
  };

  const handleDeleteLie = async (lieId: string) => {
    try {
      await AdminService.deleteQuestionLie(lieId);
      setQuestionLies((prev) => prev.filter((l) => l.id !== lieId));
      toast.success('تم حذف الإجابة المضللة');
      loadLieCounts();
    } catch (error) {
      toast.error('حدث خطأ أثناء الحذف');
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold">إدارة الأسئلة</h2>
        <div className="flex flex-wrap gap-2">
          <GradientButton variant="cyan" onClick={handleAddNew}>
            + إضافة سؤال
          </GradientButton>
          <GradientButton
            variant="purple"
            onClick={() => fileInputRef.current?.click()}
          >
            رفع CSV
          </GradientButton>
          <a
            href="/fgsh-question-template.csv"
            download
            className="btn-gradient btn-purple text-base sm:text-lg min-h-[48px] sm:min-h-[56px] px-6 sm:px-8 inline-flex items-center justify-center"
          >
            تحميل قالب CSV
          </a>
          <GradientButton
            variant="cyan"
            onClick={() => { setShowAIGenerateModal(true); setAiPreview(null); }}
          >
            إنشاء بالذكاء الاصطناعي
          </GradientButton>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,.txt,text/csv"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <input
          type="text"
          placeholder="بحث في الأسئلة..."
          value={filters.search || ''}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="glass px-4 py-3 rounded-xl text-white placeholder-white/50 outline-none focus:ring-2 focus:ring-purple-500"
        />
        <select
          value={filters.category || ''}
          onChange={(e) => setFilters({ ...filters, category: e.target.value || undefined })}
          className="glass px-4 py-3 rounded-xl text-white outline-none focus:ring-2 focus:ring-purple-500 bg-transparent"
        >
          <option value="" className="bg-purple-900">جميع الفئات</option>
          {categories.map((cat) => (
            <option key={cat} value={cat} className="bg-purple-900">{cat}</option>
          ))}
        </select>
        <select
          value={filters.difficulty || ''}
          onChange={(e) => setFilters({ ...filters, difficulty: e.target.value as any || undefined })}
          className="glass px-4 py-3 rounded-xl text-white outline-none focus:ring-2 focus:ring-purple-500 bg-transparent"
        >
          <option value="" className="bg-purple-900">جميع المستويات</option>
          <option value="easy" className="bg-purple-900">سهل</option>
          <option value="medium" className="bg-purple-900">متوسط</option>
          <option value="hard" className="bg-purple-900">صعب</option>
        </select>
        <select
          value={filters.language || ''}
          onChange={(e) => setFilters({ ...filters, language: e.target.value as any || undefined })}
          className="glass px-4 py-3 rounded-xl text-white outline-none focus:ring-2 focus:ring-purple-500 bg-transparent"
        >
          <option value="" className="bg-purple-900">جميع اللغات</option>
          <option value="ar" className="bg-purple-900">عربي</option>
          <option value="en" className="bg-purple-900">إنجليزي</option>
        </select>
      </div>

      {selectedQuestionCount > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-red-100">
            تم تحديد {selectedQuestionCount} سؤال
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={clearQuestionSelection}
              className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/15"
            >
              إلغاء التحديد
            </button>
            <button
              type="button"
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600"
            >
              حذف المحدد
            </button>
          </div>
        </div>
      )}

      {/* Questions Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-12 text-white/60">
          <p className="text-lg mb-2">لا توجد أسئلة</p>
          <p className="text-sm">اضغط على "إضافة سؤال" لإضافة سؤال جديد</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-3 px-4" aria-label="تحديد"></th>
                <th className="text-right py-3 px-4 font-semibold text-white/70">#</th>
                <th className="text-right py-3 px-4 font-semibold text-white/70">السؤال</th>
                <th className="text-right py-3 px-4 font-semibold text-white/70">الإجابة</th>
                <th className="text-right py-3 px-4 font-semibold text-white/70" aria-sort={categorySort === 'asc' ? 'ascending' : categorySort === 'desc' ? 'descending' : 'none'}>
                  <button
                    type="button"
                    onClick={handleCategorySortToggle}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <span>الفئة</span>
                    <span className="text-xs text-white/50">
                      {categorySort === 'asc' ? '↑' : categorySort === 'desc' ? '↓' : '↕'}
                    </span>
                  </button>
                </th>
                <th className="text-right py-3 px-4 font-semibold text-white/70">المستوى</th>
                <th className="text-right py-3 px-4 font-semibold text-white/70">الأكاذيب</th>
                <th className="text-right py-3 px-4 font-semibold text-white/70">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {sortedQuestions.map((question, index) => (
                <tr
                  key={question.id}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td className="py-3 px-4">
                    <input
                      type="checkbox"
                      checked={selectedQuestionIds.has(question.id)}
                      onChange={() => toggleQuestionSelection(question.id)}
                      className="h-4 w-4 rounded border-white/30 bg-white/10 text-red-500 focus:ring-red-500"
                      aria-label={`تحديد السؤال ${index + 1}`}
                    />
                  </td>
                  <td className="py-3 px-4 text-white/60">{index + 1}</td>
                  <td className="py-3 px-4 max-w-xs truncate">{question.question_text}</td>
                  <td className="py-3 px-4 max-w-xs truncate text-white/80">{question.correct_answer}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-1 rounded-lg bg-purple-500/20 text-purple-200 text-sm">
                      {question.category || '-'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded-lg text-sm ${
                      question.difficulty === 'easy' ? 'bg-green-500/20 text-green-300' :
                      question.difficulty === 'medium' ? 'bg-yellow-500/20 text-yellow-300' :
                      'bg-red-500/20 text-red-300'
                    }`}>
                      {DIFFICULTY_LABELS[question.difficulty]}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => handleOpenLies(question)}
                      className={`px-2 py-1 rounded-lg text-sm transition-colors ${
                        (lieCounts[question.id] || 0) > 0
                          ? 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30'
                          : 'bg-white/5 text-white/40 hover:bg-white/10'
                      }`}
                    >
                      {lieCounts[question.id] || 0} أكاذيب
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(question)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        title="تعديل"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(question.id)}
                        className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                        title="حذف"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && editingQuestion && (
        <ModalBackdrop>
          <div className="glass max-w-lg w-full rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-6">
              {editingQuestion.id ? 'تعديل سؤال' : 'إضافة سؤال جديد'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-white/70 mb-2">السؤال *</label>
                <textarea
                  value={editingQuestion.question_text}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, question_text: e.target.value })}
                  className="w-full glass px-4 py-3 rounded-xl text-white outline-none focus:ring-2 focus:ring-purple-500 min-h-[100px] resize-none"
                  dir="rtl"
                  placeholder="اكتب السؤال هنا..."
                />
              </div>

              <div>
                <label className="block text-white/70 mb-2">الإجابة الصحيحة *</label>
                <input
                  type="text"
                  value={editingQuestion.correct_answer}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, correct_answer: e.target.value })}
                  className="w-full glass px-4 py-3 rounded-xl text-white outline-none focus:ring-2 focus:ring-purple-500"
                  dir="rtl"
                  placeholder="اكتب الإجابة الصحيحة..."
                />
              </div>

              <div>
                <label className="block text-white/70 mb-2">الفئة</label>
                <input
                  type="text"
                  value={editingQuestion.category || ''}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, category: e.target.value })}
                  className="w-full glass px-4 py-3 rounded-xl text-white outline-none focus:ring-2 focus:ring-purple-500"
                  dir="rtl"
                  placeholder="مثال: تاريخ، رياضة، علوم..."
                  list="categories"
                />
                <datalist id="categories">
                  {categories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-white/70 mb-2">المستوى</label>
                <div className="flex gap-3">
                  {(['easy', 'medium', 'hard'] as const).map((level) => (
                    <label key={level} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="difficulty"
                        checked={editingQuestion.difficulty === level}
                        onChange={() => setEditingQuestion({ ...editingQuestion, difficulty: level })}
                        className="w-4 h-4"
                      />
                      <span>{DIFFICULTY_LABELS[level]}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-white/70 mb-2">اللغة</label>
                <div className="flex gap-3">
                  {(['ar', 'en'] as const).map((lang) => (
                    <label key={lang} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="language"
                        checked={editingQuestion.language === lang}
                        onChange={() => setEditingQuestion({ ...editingQuestion, language: lang })}
                        className="w-4 h-4"
                      />
                      <span>{LANGUAGE_LABELS[lang]}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <GradientButton variant="cyan" onClick={handleSave} className="flex-1">
                حفظ
              </GradientButton>
              <GradientButton
                variant="purple"
                onClick={() => { setShowModal(false); setEditingQuestion(null); }}
                className="flex-1"
              >
                إلغاء
              </GradientButton>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <ModalBackdrop>
          <div className="glass max-w-sm w-full rounded-2xl p-6 text-center max-h-[90vh] overflow-y-auto">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-3xl">🗑️</span>
            </div>
            <h3 className="text-xl font-bold mb-2">هل أنت متأكد؟</h3>
            <p className="text-white/60 mb-6">سيتم إخفاء هذا السؤال من لوحة التحكم والجولات الجديدة مع الاحتفاظ بالسجلات السابقة.</p>
            <div className="flex gap-3">
              <GradientButton
                variant="cyan"
                onClick={() => handleDelete(showDeleteConfirm)}
                className="flex-1"
              >
                نعم، أزله
              </GradientButton>
              <GradientButton
                variant="purple"
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1"
              >
                إلغاء
              </GradientButton>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <ModalBackdrop>
          <div className="glass max-w-sm w-full rounded-2xl p-6 text-center max-h-[90vh] overflow-y-auto">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-3xl">🗑️</span>
            </div>
            <h3 className="text-xl font-bold mb-2">تأكيد حذف الأسئلة المحددة</h3>
            <p className="text-white/60 mb-6">
              سيتم إخفاء {selectedQuestionCount} سؤال من لوحة التحكم والجولات الجديدة مع الاحتفاظ بسجلات الألعاب السابقة.
            </p>
            <div className="flex gap-3">
              <GradientButton
                variant="pink"
                onClick={handleBulkDelete}
                disabled={selectedQuestionCount === 0}
                className="flex-1"
              >
                نعم، احذفها
              </GradientButton>
              <GradientButton
                variant="purple"
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="flex-1"
              >
                إلغاء
              </GradientButton>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* Upload Preview Modal */}
      {showUploadModal && uploadPreview && (
        <ModalBackdrop>
          <div className="glass max-w-2xl w-full rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">معاينة الأسئلة للاستيراد</h3>
            <p className="text-white/60 mb-4">تم العثور على {uploadPreview.length} سؤال صالح</p>

            {uploadErrors.length > 0 && (
              <div className="mb-4 rounded-xl border border-yellow-400/30 bg-yellow-500/10 p-3 text-sm text-yellow-100">
                <p className="mb-2 font-semibold">تم تجاهل {uploadErrors.length} صف بسبب أخطاء في CSV:</p>
                <ul className="space-y-1 list-disc list-inside">
                  {uploadErrors.slice(0, 8).map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
                {uploadErrors.length > 8 && (
                  <p className="mt-2 text-yellow-100/70">... و {uploadErrors.length - 8} أخطاء أخرى</p>
                )}
              </div>
            )}

            <div className="space-y-3 mb-6 max-h-[50vh] overflow-y-auto">
              {uploadPreview.slice(0, 10).map((q, index) => (
                <div key={index} className="bg-white/5 rounded-xl p-3">
                  <p className="font-semibold mb-1">{q.question_text}</p>
                  <p className="text-white/60 text-sm">الإجابة: {q.correct_answer}</p>
                  <div className="flex gap-2 mt-2">
                    <span className="px-2 py-0.5 rounded bg-purple-500/20 text-xs">{q.category || 'بدون فئة'}</span>
                    <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-xs">{DIFFICULTY_LABELS[q.difficulty]}</span>
                    <span className="px-2 py-0.5 rounded bg-blue-500/20 text-xs">{LANGUAGE_LABELS[q.language]}</span>
                  </div>
                </div>
              ))}
              {uploadPreview.length > 10 && (
                <p className="text-center text-white/40">... و {uploadPreview.length - 10} سؤال آخر</p>
              )}
            </div>

            <div className="flex gap-3">
              <GradientButton variant="cyan" onClick={handleBulkImport} className="flex-1">
                استيراد الكل ({uploadPreview.length})
              </GradientButton>
              <GradientButton
                variant="purple"
                onClick={() => { setShowUploadModal(false); setUploadPreview(null); setUploadErrors([]); }}
                className="flex-1"
              >
                إلغاء
              </GradientButton>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* AI Question Generation Modal */}
      {showAIGenerateModal && (
        <ModalBackdrop>
          <div className="glass max-w-2xl w-full rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-6">إنشاء أسئلة بالذكاء الاصطناعي</h3>

            {!aiPreview ? (
              // Configuration form
              <div className="space-y-4">
                <div>
                  <label className="block text-white/70 mb-2">الفئة *</label>
                  <input
                    type="text"
                    value={aiCategory}
                    onChange={(e) => setAiCategory(e.target.value)}
                    className="w-full glass px-4 py-3 rounded-xl text-white outline-none focus:ring-2 focus:ring-purple-500"
                    dir="rtl"
                    placeholder="مثال: كرة القدم، تاريخ، جغرافيا..."
                    list="categories"
                  />
                </div>

                <div>
                  <label htmlFor="ai-question-count" className="block text-white/70 mb-2">عدد الأسئلة: {aiCount}</label>
                  <input
                    id="ai-question-count"
                    type="range"
                    min={1}
                    max={20}
                    value={aiCount}
                    onChange={(e) => setAiCount(Number(e.target.value))}
                    className="w-full"
                    aria-label="عدد الأسئلة"
                  />
                  <div className="flex justify-between text-white/40 text-xs mt-1">
                    <span>1</span>
                    <span>20</span>
                  </div>
                </div>

                <div>
                  <label className="block text-white/70 mb-2">المستوى</label>
                  <div className="flex gap-3">
                    {(['easy', 'medium', 'hard'] as const).map((level) => (
                      <label key={level} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="ai-difficulty"
                          checked={aiDifficulty === level}
                          onChange={() => setAiDifficulty(level)}
                          className="w-4 h-4"
                        />
                        <span>{DIFFICULTY_LABELS[level]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <GradientButton
                    variant="cyan"
                    onClick={handleAIGenerate}
                    disabled={aiGenerating || !aiCategory.trim()}
                    className="flex-1"
                  >
                    {aiGenerating ? 'جاري الإنشاء...' : 'إنشاء'}
                  </GradientButton>
                  <GradientButton
                    variant="purple"
                    onClick={() => setShowAIGenerateModal(false)}
                    className="flex-1"
                  >
                    إلغاء
                  </GradientButton>
                </div>
              </div>
            ) : (
              // Preview generated questions
              <div>
                <p className="text-white/60 mb-4">
                  تم إنشاء {aiPreview.length} سؤال — احذف الأسئلة غير المناسبة ثم اضغط "استيراد"
                </p>

                <div className="space-y-3 mb-6 max-h-[50vh] overflow-y-auto">
                  {aiPreview.map((q, index) => (
                    <div
                      key={index}
                      className={`rounded-xl p-3 flex items-start gap-3 transition-colors ${
                        q._excluded ? 'bg-red-500/10 opacity-50' : 'bg-white/5'
                      }`}
                    >
                      <div className="flex-1" dir="rtl">
                        <p className="font-semibold mb-1">{q.question_text}</p>
                        <p className="text-white/60 text-sm">الإجابة: {q.correct_answer}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAiPreview((prev) =>
                            prev!.map((item, i) =>
                              i === index ? { ...item, _excluded: !item._excluded } : item
                            )
                          );
                        }}
                        className={`p-2 rounded-lg transition-colors shrink-0 ${
                          q._excluded
                            ? 'hover:bg-green-500/20 text-green-400'
                            : 'hover:bg-red-500/20 text-red-400'
                        }`}
                        title={q._excluded ? 'استعادة' : 'حذف'}
                      >
                        {q._excluded ? '↩️' : '✕'}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <GradientButton variant="cyan" onClick={handleAIImport} className="flex-1">
                    استيراد ({aiPreview.filter((q) => !q._excluded).length})
                  </GradientButton>
                  <GradientButton
                    variant="purple"
                    onClick={() => setAiPreview(null)}
                    className="flex-1"
                  >
                    رجوع
                  </GradientButton>
                </div>
              </div>
            )}
          </div>
        </ModalBackdrop>
      )}

      {/* Lies Management Modal */}
      {showLiesModal && liesQuestion && (
        <ModalBackdrop>
          <div className="glass max-w-lg w-full rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-2">الإجابات المضللة</h3>
            <div className="bg-white/5 rounded-xl p-3 mb-4" dir="rtl">
              <p className="text-white/70 text-sm mb-1">السؤال:</p>
              <p className="font-semibold">{liesQuestion.question_text}</p>
              <p className="text-cyan-300 text-sm mt-1">الإجابة: {liesQuestion.correct_answer}</p>
            </div>

            {liesLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner size="md" />
              </div>
            ) : (
              <>
                {questionLies.length === 0 ? (
                  <p className="text-center text-white/40 py-6">لا توجد إجابات مضللة بعد</p>
                ) : (
                  <div className="space-y-2 mb-4 max-h-[40vh] overflow-y-auto">
                    {questionLies.map((lie) => (
                      <div key={lie.id} className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
                        <span className="flex-1" dir="rtl">{lie.lie_text}</span>
                        <span className={`px-2 py-0.5 rounded text-xs shrink-0 ${
                          lie.source === 'ai' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-purple-500/20 text-purple-300'
                        }`}>
                          {lie.source === 'ai' ? 'ذكاء اصطناعي' : 'يدوي'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteLie(lie.id)}
                          className="p-1 hover:bg-red-500/20 rounded-lg transition-colors text-red-400 shrink-0"
                          title="حذف"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Manual lie input */}
            <div className="flex gap-2 mt-4">
              <input
                type="text"
                value={newLieText}
                onChange={(e) => setNewLieText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddManualLie(); }}
                className="flex-1 glass px-4 py-2 rounded-xl text-white outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                dir="rtl"
                placeholder="أضف إجابة مضللة يدوياً..."
              />
              <button
                type="button"
                onClick={handleAddManualLie}
                disabled={!newLieText.trim()}
                className="px-4 py-2 rounded-xl bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm shrink-0"
              >
                إضافة
              </button>
            </div>

            {/* AI generation controls */}
            <div className="mt-4 bg-white/5 rounded-xl p-3">
              <label htmlFor="ai-lie-count" className="block text-white/70 text-sm mb-2">
                عدد الأكاذيب بالذكاء الاصطناعي: {aiLieCount}
              </label>
              <input
                id="ai-lie-count"
                type="range"
                min={1}
                max={5}
                value={aiLieCount}
                onChange={(e) => setAiLieCount(Number(e.target.value))}
                className="w-full mb-3"
                aria-label="عدد الأكاذيب"
              />
              <div className="flex justify-between text-white/40 text-xs mb-3">
                <span>1</span>
                <span>5</span>
              </div>
              <GradientButton
                variant="cyan"
                onClick={handleGenerateLies}
                disabled={liesGenerating}
                className="w-full"
              >
                {liesGenerating ? 'جاري الإنشاء...' : `إنشاء ${aiLieCount} بالذكاء الاصطناعي`}
              </GradientButton>
            </div>

            <div className="mt-3">
              <GradientButton
                variant="purple"
                onClick={() => { setShowLiesModal(false); setLiesQuestion(null); setQuestionLies([]); setNewLieText(''); }}
                className="w-full"
              >
                إغلاق
              </GradientButton>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
};
