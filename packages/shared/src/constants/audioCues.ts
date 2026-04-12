export type GameAudioCueKey =
  | 'category_selection_start'
  | 'answering_start'
  | 'voting_start'
  | 'reveal_start'
  | 'double_points_round_start'
  | 'triple_points_round_start'
  | 'background_music'
  | 'game_end_victory';

export interface GameAudioCueDefinition {
  key: GameAudioCueKey;
  label: string;
  description: string;
}

export const GAME_AUDIO_CUE_DEFINITIONS: readonly GameAudioCueDefinition[] = [
  {
    key: 'category_selection_start',
    label: 'بداية اختيار الفئة',
    description: 'يُشغّل عند بدء شاشة اختيار الفئة في بداية كل مرحلة.',
  },
  {
    key: 'answering_start',
    label: 'بدء كتابة الإجابات',
    description: 'يُشغّل عند ظهور السؤال وبدء وقت إدخال الكذبة.',
  },
  {
    key: 'voting_start',
    label: 'بدء التصويت',
    description: 'يُشغّل عند الانتقال لمرحلة التصويت على الإجابات.',
  },
  {
    key: 'reveal_start',
    label: 'بدء كشف الإجابات',
    description: 'يُشغّل عند الانتقال إلى مراجعة النتائج/الكشف.',
  },
  {
    key: 'double_points_round_start',
    label: 'بداية جولة 2x',
    description: 'يُشغّل عند بدء جولة النقاط المضاعفة.',
  },
  {
    key: 'triple_points_round_start',
    label: 'بداية جولة 3x',
    description: 'يُشغّل عند بدء الجولة النهائية (النقاط الثلاثية).',
  },
  {
    key: 'background_music',
    label: 'موسيقى الخلفية',
    description: 'يُشغّل كمسار خلفي مستمر على شاشة التلفزيون أثناء سير اللعبة.',
  },
  {
    key: 'game_end_victory',
    label: 'نهاية اللعبة - فوز',
    description: 'يُشغّل عند عرض النتائج النهائية وإعلان الفائز.',
  },
] as const;
