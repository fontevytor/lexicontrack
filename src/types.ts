export interface AudioData {
  id: string;
  titulo: string;
  texto: string;
  illustration?: string;
}

export interface LessonData {
  id: string;
  nomeDaAula: string;
  audios: AudioData[];
}

export type Chunk = 
  | { type: 'text'; content: string; duration: number; start: number }
  | { type: 'pause'; duration: number; start: number };
