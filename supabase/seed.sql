-- Seed data for Fakash Game
-- Arabic trivia questions for initial testing and demo

-- Clear existing data (for development)
TRUNCATE questions CASCADE;

-- Insert Arabic trivia questions
INSERT INTO questions (question_text, correct_answer, category, difficulty, language) VALUES
-- Geography (جغرافيا)
('كم عدد الدول العربية؟', '22', 'جغرافيا', 'easy', 'ar'),
('ما هي عاصمة المغرب؟', 'الرباط', 'جغرافيا', 'easy', 'ar'),
('ما هي أكبر دولة عربية من حيث المساحة؟', 'الجزائر', 'جغرافيا', 'medium', 'ar'),
('ما هو أطول نهر في العالم؟', 'نهر النيل', 'جغرافيا', 'easy', 'ar'),
('كم عدد قارات العالم؟', '7', 'جغرافيا', 'easy', 'ar'),
('ما هي عاصمة مصر؟', 'القاهرة', 'جغرافيا', 'easy', 'ar'),
('ما هي أصغر دولة في العالم؟', 'الفاتيكان', 'جغرافيا', 'medium', 'ar'),

-- History (تاريخ)
('في أي عام تم فتح مكة؟', '8 هجرية', 'تاريخ', 'medium', 'ar'),
('من هو أول خليفة في الإسلام؟', 'أبو بكر الصديق', 'تاريخ', 'easy', 'ar'),
('كم استمرت الدولة العثمانية؟', '600 سنة تقريباً', 'تاريخ', 'medium', 'ar'),
('في أي قرن اخترع الطباعة؟', 'القرن الخامس عشر', 'تاريخ', 'hard', 'ar'),

-- Religion (دين)
('كم عدد أركان الإسلام؟', '5', 'دين', 'easy', 'ar'),
('كم عدد سور القرآن الكريم؟', '114', 'دين', 'easy', 'ar'),
('ما هي أطول سورة في القرآن؟', 'سورة البقرة', 'دين', 'easy', 'ar'),
('في أي شهر فرض الصيام؟', 'شعبان', 'دين', 'medium', 'ar'),
('كم عدد أسماء الله الحسنى؟', '99', 'دين', 'easy', 'ar'),

-- Literature (أدب)
('من كتب رواية "الأيام"؟', 'طه حسين', 'أدب', 'medium', 'ar'),
('من هو شاعر النيل؟', 'حافظ إبراهيم', 'أدب', 'medium', 'ar'),
('من كتب "ألف ليلة وليلة"؟', 'مجهول', 'أدب', 'hard', 'ar'),

-- Science (علوم)
('كم عدد كواكب المجموعة الشمسية؟', '8', 'علوم', 'easy', 'ar'),
('ما هو الرمز الكيميائي للذهب؟', 'Au', 'علوم', 'medium', 'ar'),
('ما هو أسرع حيوان بري؟', 'الفهد', 'علوم', 'easy', 'ar'),
('كم عدد عظام جسم الإنسان البالغ؟', '206', 'علوم', 'medium', 'ar'),
('ما هي أكبر عضو في جسم الإنسان؟', 'الجلد', 'علوم', 'medium', 'ar'),

-- Sports (رياضة)
('كم عدد لاعبي فريق كرة القدم؟', '11', 'رياضة', 'easy', 'ar'),
('في أي مدينة أقيمت أول بطولة كأس العالم؟', 'مونتيفيديو', 'رياضة', 'hard', 'ar'),
('كم عدد الحلقات في شعار الألعاب الأولمبية؟', '5', 'رياضة', 'easy', 'ar'),

-- General Knowledge (ثقافة عامة)
('كم عدد أيام السنة الميلادية؟', '365', 'ثقافة عامة', 'easy', 'ar'),
('ما هو لون السماء؟', 'أزرق', 'ثقافة عامة', 'easy', 'ar'),
('كم عدد ألوان قوس قزح؟', '7', 'ثقافة عامة', 'easy', 'ar'),
('ما هي أكبر محيطات العالم؟', 'المحيط الهادئ', 'ثقافة عامة', 'easy', 'ar'),

-- Technology (تكنولوجيا)
('من مؤسس شركة أبل؟', 'ستيف جوبز', 'تكنولوجيا', 'easy', 'ar'),
('في أي عام تأسست شركة جوجل؟', '1998', 'تكنولوجيا', 'medium', 'ar'),
('ما هو الموقع الأكثر زيارة في العالم؟', 'جوجل', 'تكنولوجيا', 'easy', 'ar');

-- Add some English questions for testing
INSERT INTO questions (question_text, correct_answer, category, difficulty, language) VALUES
('How many continents are there?', '7', 'Geography', 'easy', 'en'),
('What is the capital of France?', 'Paris', 'Geography', 'easy', 'en'),
('How many planets are in our solar system?', '8', 'Science', 'easy', 'en'),
('What is the chemical symbol for water?', 'H2O', 'Science', 'easy', 'en'),
('How many players are on a basketball team?', '5', 'Sports', 'easy', 'en');

-- Verify insertion
SELECT
  language,
  category,
  difficulty,
  COUNT(*) as question_count
FROM questions
GROUP BY language, category, difficulty
ORDER BY language, category, difficulty;
