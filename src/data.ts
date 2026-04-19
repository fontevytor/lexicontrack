import { LessonData } from './types';

export const LESSONS: LessonData[] = [
  {
    id: 'lesson-1',
    nomeDaAula: "Lesson 1: Foundations",
    audios: [
      {
        id: 'l1-a1',
        titulo: "Meals & Dining",
        texto: " [PAUSA 2] Rice [PAUSA 2] Beans [PAUSA 2] Beef [PAUSA 2] French Fries [PAUSA 2] I would like to order some rice and beans, please. [PAUSA 3] Certainly, would you like a side of beef or french fries? [PAUSA 3]",
        illustration: "🍽️"
      },
      {
        id: 'l1-a2',
        titulo: "Daily Routine",
        texto: "Wait for me! [PAUSA 1] I am coming! [PAUSA 1] Are you there? [PAUSA 2] Yes, I'm just getting ready for work. [PAUSA 2]",
        illustration: "🌅"
      }
    ]
  },
  {
    id: 'lesson-2',
    nomeDaAula: "Lesson 2: Conversations",
    audios: [
      {
        id: 'l2-a1',
        titulo: "Meeting a Friend",
        texto: "Hey! Long time no see. [PAUSA 2] How have you been? [PAUSA 2] I've been great, thanks for asking. [PAUSA 2]",
        illustration: "🤝"
      }
    ]
  }
];
