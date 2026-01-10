import React, { useState, useEffect, useRef } from 'react';
import { AdminService, type Question, type QuestionInput, type QuestionFilters } from '@fakash/shared';
import { GradientButton } from '../GradientButton';
import { LoadingSpinner } from '../LoadingSpinner';
import toast from 'react-hot-toast';

interface EditingQuestion extends QuestionInput {
  id?: string;
}

const DIFFICULTY_LABELS = {
  easy: 'سهل',
  medium: 'متوسط',
  hard: 'صعب',
};

const LANGUAGE_LABELS = {
  ar: 'عربي',
  en: 'إنجليزي',
};

export const QuestionManager: React.FC = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<EditingQuestion | null>(null);
  const [filters, setFilters] = useState<QuestionFilters>({});
  const [uploadPreview, setUploadPreview] = useState<QuestionInput[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadQuestions();
    loadCategories();
  }, [filters]);

  const loadQuestions = async () => {
    setLoading(true);
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
      toast.error('حدث خطأ أثناء الحفظ');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await AdminService.deleteQuestion(id);
      toast.success('تم حذف السؤال بنجاح');
      setShowDeleteConfirm(null);
      loadQuestions();
    } catch (error) {
      toast.error('حدث خطأ أثناء الحذف');
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

        if (file.name.endsWith('.json')) {
          parsed = JSON.parse(content);
        } else if (file.name.endsWith('.csv')) {
          parsed = parseCSV(content);
        } else {
          toast.error('يرجى رفع ملف CSV أو JSON');
          return;
        }

        // Validate parsed data
        const validQuestions = parsed.filter(
          (q) => q.question_text && q.correct_answer && q.difficulty && q.language
        );

        if (validQuestions.length === 0) {
          toast.error('لم يتم العثور على أسئلة صالحة في الملف');
          return;
        }

        setUploadPreview(validQuestions);
        setShowUploadModal(true);
      } catch (error) {
        toast.error('حدث خطأ في قراءة الملف');
      }
    };
    reader.readAsText(file);
  };

  const parseCSV = (content: string): QuestionInput[] => {
    const lines = content.split('\n').filter((line) => line.trim());
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    
    return lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim());
      const obj: Record<string, string> = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });
      
      return {
        question_text: obj.question_text || obj.question || '',
        correct_answer: obj.correct_answer || obj.answer || '',
        category: obj.category || '',
        difficulty: (obj.difficulty as 'easy' | 'medium' | 'hard') || 'medium',
        language: (obj.language as 'ar' | 'en') || 'ar',
      };
    });
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
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      loadQuestions();
      loadCategories();
    } catch (error) {
      toast.error('حدث خطأ أثناء الاستيراد');
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
            📤 رفع ملف
          </GradientButton>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <input
          type="text"
          placeholder="🔍 بحث في الأسئلة..."
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
                <th className="text-right py-3 px-4 font-semibold text-white/70">#</th>
                <th className="text-right py-3 px-4 font-semibold text-white/70">السؤال</th>
                <th className="text-right py-3 px-4 font-semibold text-white/70">الإجابة</th>
                <th className="text-right py-3 px-4 font-semibold text-white/70">الفئة</th>
                <th className="text-right py-3 px-4 font-semibold text-white/70">المستوى</th>
                <th className="text-right py-3 px-4 font-semibold text-white/70">اللغة</th>
                <th className="text-right py-3 px-4 font-semibold text-white/70">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((question, index) => (
                <tr 
                  key={question.id} 
                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
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
                    <span className="px-2 py-1 rounded-lg bg-blue-500/20 text-blue-200 text-sm">
                      {LANGUAGE_LABELS[question.language]}
                    </span>
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
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
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass max-w-sm w-full rounded-2xl p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-3xl">🗑️</span>
            </div>
            <h3 className="text-xl font-bold mb-2">هل أنت متأكد؟</h3>
            <p className="text-white/60 mb-6">سيتم حذف هذا السؤال نهائياً ولا يمكن استرجاعه.</p>
            <div className="flex gap-3">
              <GradientButton 
                variant="cyan" 
                onClick={() => handleDelete(showDeleteConfirm)} 
                className="flex-1"
              >
                نعم، احذف
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
        </div>
      )}

      {/* Upload Preview Modal */}
      {showUploadModal && uploadPreview && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass max-w-2xl w-full rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">معاينة الأسئلة للاستيراد</h3>
            <p className="text-white/60 mb-4">تم العثور على {uploadPreview.length} سؤال صالح</p>
            
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
                onClick={() => { setShowUploadModal(false); setUploadPreview(null); }}
                className="flex-1"
              >
                إلغاء
              </GradientButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
