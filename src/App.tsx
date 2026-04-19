import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  X, 
  ChevronRight, 
  ChevronDown, 
  Headphones, 
  BookOpen, 
  Settings2,
  Volume2
} from 'lucide-react';
import { LESSONS } from './data';
import { AudioData, LessonData, Chunk } from './types';

// --- Utilities ---
const parseChunks = (texto: string): { chunks: Chunk[], totalDuration: number } => {
  const chunks: Chunk[] = [];
  let timeAccum = 0;
  const parts = texto.split(/(\[PAUSA\s?\d*\])/g);
  
  parts.forEach(part => {
    if (part.trim() === "") return;
    
    if (part.startsWith("[PAUSA")) {
      const match = part.match(/\d+/);
      const seconds = parseInt(match ? match[0] : '2');
      chunks.push({ type: 'pause', duration: seconds, start: timeAccum });
      timeAccum += seconds;
    } else {
      // Estimate duration: ~15 chars per second for normal speech
      const dur = Math.max(1, part.length / 15); 
      chunks.push({ type: 'text', content: part.trim(), duration: dur, start: timeAccum });
      timeAccum += dur;
    }
  });

  return { chunks, totalDuration: timeAccum };
};

const formatTime = (s: number) => {
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// --- Components ---

const Logo = ({ size = 32 }: { size?: number }) => (
  <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
      {/* Outer Triangle (White) */}
      <motion.path 
        d="M 50 10 L 90 85 L 10 85 Z" 
        fill="white" 
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
      />
      {/* Inner Triangle (Purple) */}
      <motion.path 
        d="M 50 35 L 75 80 L 25 80 Z" 
        fill="#818cf8"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2 }}
      />
    </svg>
  </div>
);

export default function App() {
  const [lessons, setLessons] = useState<LessonData[]>(() => {
    const saved = localStorage.getItem('ethereal_lessons');
    return saved ? JSON.parse(saved) : LESSONS;
  });
  
  const [currentView, setCurrentView] = useState<'menu' | 'app'>('menu');
  const [deviceMode, setDeviceMode] = useState<'mobile' | 'desktop'>('desktop');
  const [showMobileModules, setShowMobileModules] = useState(false);
  
  const [selectedAudio, setSelectedAudio] = useState<AudioData>(lessons[0].audios[0]);
  const [activeLessonId, setActiveLessonId] = useState<string>(lessons[0].id);
  const [playerMode, setPlayerMode] = useState<'focus' | 'audio'>('focus');
  const [voiceType, setVoiceType] = useState<'UK-M' | 'UK-F' | 'US-F'>('UK-F');
  const [allVoices, setAllVoices] = useState<SpeechSynthesisVoice[]>([]);
  
  // Admin State
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [adminView, setAdminView] = useState<'dashboard' | 'edit_lesson' | 'edit_audio' | null>(null);
  const [editingLesson, setEditingLesson] = useState<LessonData | null>(null);
  const [editingAudio, setEditingAudio] = useState<AudioData | null>(null);

  // Custom Confirm Dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  useEffect(() => {
    localStorage.setItem('ethereal_lessons', JSON.stringify(lessons));
  }, [lessons]);

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAllVoices(voices);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const getVoice = useCallback(() => {
    const findVoice = (lang: string, gender: 'Male' | 'Female', preferredName?: string) => {
      const candidates = allVoices.filter(v => v.lang.startsWith(lang));
      
      // Try exact name match first if provided
      if (preferredName) {
        const exactMatch = candidates.find(v => v.name.toLowerCase().includes(preferredName.toLowerCase()));
        if (exactMatch) return exactMatch;
      }

      const isMale = (v: SpeechSynthesisVoice) => {
        const name = v.name.toLowerCase();
        if (name.includes('male') && !name.includes('female')) return true;
        if (name.includes('david') || name.includes('daniel') || name.includes('harry') || name.includes('james') || name.includes('mark') || name.includes('guy') || name.includes('joey') || name.includes('alex') || name.includes('liam')) return true;
        return false;
      };

      const isFemale = (v: SpeechSynthesisVoice) => {
        const name = v.name.toLowerCase();
        if (name.includes('female')) return true;
        if (name.includes('samantha') || name.includes('zira') || name.includes('emma') || name.includes('google us english')) return true;
        return false;
      };

      const genderFiltered = candidates.filter(v => 
        gender === 'Male' ? isMale(v) : isFemale(v)
      );

      // Tier 1: Premium/Google/Natural
      const premium = genderFiltered.filter(v => 
        v.name.includes('Google') || v.name.includes('Neural') || v.name.includes('Natural')
      );

      if (premium.length > 0) return premium[0];
      if (genderFiltered.length > 0) return genderFiltered[0];
      
      return candidates[0] || null;
    };

    if (voiceType === 'UK-M') return findVoice('en-GB', 'Male', 'Harry');
    if (voiceType === 'UK-F') return findVoice('en-GB', 'Female', 'Emma');
    if (voiceType === 'US-F') return findVoice('en-US', 'Female', 'Jerry');

    return allVoices.find(v => v.lang.startsWith('en')) || null;
  }, [allVoices, voiceType]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "admin12345") {
      setIsAdmin(true);
      setShowLogin(false);
      setLoginError("");
      setAdminView('dashboard');
      setCurrentView('app');
    } else {
      setLoginError("Invalid Passcode. Please try again.");
      setPassword("");
    }
  };

  // CRUD Actions
  const addLesson = () => {
    const newLesson: LessonData = {
      id: `lesson-${Date.now()}`,
      nomeDaAula: "New Lesson",
      audios: []
    };
    setLessons([...lessons, newLesson]);
    setEditingLesson(newLesson);
    setAdminView('edit_lesson');
  };

  const deleteLesson = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Module",
      message: "Are you sure you want to remove this entire module and all its audio tracks?",
      onConfirm: () => {
        const filtered = lessons.filter(l => l.id !== id);
        setLessons(filtered);
        if (activeLessonId === id) {
          const nextLesson = filtered[0];
          if (nextLesson) {
            setActiveLessonId(nextLesson.id);
            setSelectedAudio(nextLesson.audios[0]);
          }
        }
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const updateLesson = (updated: LessonData) => {
    setLessons(lessons.map(l => l.id === updated.id ? updated : l));
    setEditingLesson(updated);
  };

  const addAudio = (lessonId: string) => {
    const newAudio: AudioData = {
      id: `audio-${Date.now()}`,
      titulo: "New Audio",
      texto: "New text [PAUSA 2]",
      illustration: "📝"
    };
    const lesson = lessons.find(l => l.id === lessonId);
    if (lesson) {
      const updated = { ...lesson, audios: [...lesson.audios, newAudio] };
      updateLesson(updated);
      setEditingAudio(newAudio);
      setAdminView('edit_audio');
    }
  };

  const deleteAudio = (lessonId: string, audioId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Audio",
      message: "This audio track will be permanently removed. Continue?",
      onConfirm: () => {
        const lesson = lessons.find(l => l.id === lessonId);
        if (lesson) {
          const updatedAudios = lesson.audios.filter(a => a.id !== audioId);
          const updatedLesson = { ...lesson, audios: updatedAudios };
          
          setLessons(prev => prev.map(l => l.id === lessonId ? updatedLesson : l));
          
          if (selectedAudio.id === audioId) {
            setSelectedAudio(updatedAudios[0] || lesson.audios[0]);
          }
        }
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const updateAudio = (updated: AudioData) => {
    if (!editingLesson) return;
    const updatedLesson = {
      ...editingLesson,
      audios: editingLesson.audios.map(a => a.id === updated.id ? updated : a)
    };
    updateLesson(updatedLesson);
    setEditingAudio(updated);
  };

  if (currentView === 'menu') {
    return (
      <div className="h-screen w-screen bg-[#050507] flex flex-col items-center justify-center p-6 bg-radial-gradient">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <div className="mb-10 flex justify-center scale-150">
            <Logo size={64} />
          </div>
          <h1 className="text-6xl font-serif text-white tracking-tighter mb-4 italic">LexiconTrack</h1>
          <p className="text-slate-500 uppercase tracking-[0.3em] font-medium text-xs">Immersive Language Mastery</p>
        </motion.div>

        <div className="flex flex-col gap-4 w-full max-w-sm">
          <button 
            onClick={() => setCurrentView('app')}
            className="w-full h-16 rounded-2xl bg-white text-black font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
          >
            STUDENT ACCESS
          </button>
          <button 
            onClick={() => setShowLogin(true)}
            className="w-full h-16 rounded-2xl border border-white/10 text-white font-bold text-lg hover:bg-white/5 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
          >
            ADMIN PANEL
          </button>
        </div>

        <div className="mt-20 flex items-center gap-6 p-4 rounded-3xl bg-white/5 border border-white/5">
          <button 
            onClick={() => setDeviceMode('desktop')}
            className={`px-6 py-3 rounded-2xl transition-all flex items-center gap-2 text-xs font-bold ${deviceMode === 'desktop' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            COMPUTER
          </button>
          <button 
            onClick={() => setDeviceMode('mobile')}
            className={`px-6 py-3 rounded-2xl transition-all flex items-center gap-2 text-xs font-bold ${deviceMode === 'mobile' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            MOBILE
          </button>
        </div>

        <div className="absolute bottom-10 text-[10px] text-slate-600 uppercase tracking-[0.3em] font-semibold">
          © 2026 Nody Editora
        </div>

        {/* Login Modal */}
        <AnimatePresence>
          {showLogin && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-6"
            >
              <motion.form 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onSubmit={handleLogin}
                className="w-full max-w-sm glass border border-white/10 p-10 rounded-[32px] shadow-2xl"
              >
                <h3 className="text-2xl font-serif mb-8 text-center text-white">Admin Security</h3>
                <input 
                  type="password" 
                  autoFocus
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (loginError) setLoginError("");
                  }}
                  placeholder="Enter Passcode..."
                  className={`w-full bg-white/5 border ${loginError ? 'border-red-500/50' : 'border-white/10'} rounded-2xl p-4 text-center text-lg outline-none focus:border-brand-primary transition-colors mb-2 text-white`}
                />
                <div className="h-6 mb-4">
                  <AnimatePresence>
                    {loginError && (
                      <motion.p 
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-[10px] text-red-400 text-center font-bold tracking-wider"
                      >
                        {loginError}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowLogin(false)}
                    className="flex-1 py-3 text-xs text-slate-500 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-brand-primary font-bold rounded-2xl text-xs hover:scale-105 transition-transform text-white"
                  >
                    Unlock
                  </button>
                </div>
              </motion.form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Confirmation Dialog */}
        <AnimatePresence>
          {confirmDialog.isOpen && (
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full max-w-sm glass border border-white/10 p-8 rounded-[32px] shadow-2xl"
              >
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6 text-red-500">
                  <X size={24} />
                </div>
                <h3 className="text-xl font-serif text-white mb-3">{confirmDialog.title}</h3>
                <p className="text-slate-400 text-sm mb-8 leading-relaxed">{confirmDialog.message}</p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                    className="flex-1 py-3 text-xs font-bold text-slate-500 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={confirmDialog.onConfirm}
                    className="flex-1 py-3 bg-red-500 font-bold rounded-2xl text-xs hover:bg-red-600 transition-colors text-white"
                  >
                    Delete Now
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className={`flex h-screen w-screen bg-[#050507] ${deviceMode === 'mobile' ? 'flex-col' : 'flex-row'} overflow-hidden relative`}>
      {/* Mobile Lessons Sidebar/Drawer */}
      <AnimatePresence>
        {deviceMode === 'mobile' && showMobileModules && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMobileModules(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-[85%] max-w-[320px] bg-[#0A0A0E] border-r border-white/10 z-[70] p-8 flex flex-col"
            >
              <div className="flex justify-between items-center mb-10">
                <span className="text-xs font-bold tracking-[0.3em] text-slate-500 uppercase">Modules</span>
                <button onClick={() => setShowMobileModules(false)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                {lessons.map((lesson) => (
                  <div key={lesson.id} className="mb-4">
                    <div 
                      className={`p-4 rounded-2xl border transition-all ${activeLessonId === lesson.id ? 'bg-brand-primary/10 border-brand-primary/30' : 'bg-white/[0.03] border-white/5'}`}
                      onClick={() => setActiveLessonId(lesson.id)}
                    >
                      <div className="font-bold text-sm text-white">{lesson.nomeDaAula}</div>
                    </div>
                    <AnimatePresence>
                      {activeLessonId === lesson.id && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          className="mt-2 space-y-1"
                        >
                          {lesson.audios.map((audio) => (
                            <button 
                              key={audio.id}
                              onClick={() => {
                                setSelectedAudio(audio);
                                setShowMobileModules(false);
                              }}
                              className={`w-full text-left text-xs p-3 pl-6 rounded-xl transition-colors ${selectedAudio.id === audio.id ? 'bg-white/5 text-brand-primary font-bold' : 'text-slate-500'}`}
                            >
                              {audio.titulo}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>

              <div className="mt-8 pt-6 border-t border-white/5">
                 <button 
                  onClick={() => { setCurrentView('menu'); setShowMobileModules(false); }}
                  className="w-full py-4 text-xs font-bold tracking-widest text-slate-500 hover:text-white uppercase"
                 >
                   Back to Home
                 </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Sidebar (Top bar for mobile) */}
      <aside className={`${deviceMode === 'mobile' ? 'w-full h-[64px] border-b' : 'w-[320px] h-full border-r'} border-white/10 bg-black/40 backdrop-blur-xl ${deviceMode === 'mobile' ? 'px-6 py-0' : 'p-10'} flex ${deviceMode === 'mobile' ? 'flex-row items-center justify-between' : 'flex-col'} shrink-0 z-40`}>
        <div 
          className="flex items-center gap-3 cursor-pointer" 
          onClick={() => { setCurrentView('menu'); setIsAdmin(false); setAdminView(null); }}
        >
          <Logo size={24} />
          <span className="text-md font-bold tracking-tight text-white italic">LexiconTrack</span>
        </div>

        {deviceMode === 'mobile' && !adminView && (
          <div className="flex items-center gap-2">
             <button 
              onClick={() => setShowMobileModules(true)}
              className="text-white p-3 hover:bg-white/5 rounded-full transition-colors"
             >
               <BookOpen size={20} />
             </button>
             {isAdmin && (
               <button onClick={() => setAdminView('dashboard')} className="text-brand-primary p-3 hover:bg-brand-primary/5 rounded-full transition-colors">
                 <Settings2 size={20} />
               </button>
             )}
          </div>
        )}

        {deviceMode === 'desktop' && (
          <>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-4 mt-12">Modules</div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              {lessons.map((lesson) => (
                <div 
                  key={lesson.id} 
                  className={`mb-3 p-4 rounded-xl border transition-all cursor-pointer ${activeLessonId === lesson.id && !adminView ? 'bg-brand-primary/10 border-brand-primary/50' : 'bg-white/[0.03] border-white/10 hover:bg-white/5'}`}
                  onClick={() => { setActiveLessonId(lesson.id); setAdminView(null); }}
                >
                  <div className="font-semibold text-sm mb-2 text-white">{lesson.nomeDaAula}</div>
                  <AnimatePresence>
                    {activeLessonId === lesson.id && !adminView && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-1"
                      >
                        {lesson.audios.map((audio) => (
                          <div 
                            key={audio.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAudio(audio);
                            }}
                            className={`text-xs p-2 pl-6 relative transition-colors ${selectedAudio.id === audio.id ? 'text-brand-primary font-medium' : 'text-slate-400 hover:text-white'}`}
                          >
                            <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] opacity-40">●</span>
                            {audio.titulo}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-white/5 flex flex-col gap-4">
              <button 
                onClick={() => setAdminView('dashboard')}
                className={`flex items-center gap-2 text-[10px] uppercase tracking-widest transition-colors font-bold ${isAdmin ? 'text-brand-primary' : 'text-slate-500'}`}
              >
                <Settings2 size={12} /> {isAdmin ? "ADMIN DASHBOARD" : "LOCK"}
              </button>
              <div className="text-[10px] text-slate-500 text-center opacity-40 uppercase tracking-widest font-bold">
                © 2026 Nody Editora
              </div>
            </div>
          </>
        )}

        {deviceMode === 'mobile' && !adminView && (
          <div className="flex items-center gap-4">
             <button 
              onClick={() => { setActiveLessonId(lessons[0].id); }} // Mock menu trigger
              className="text-slate-400 p-2"
             >
               <BookOpen size={20} />
             </button>
             {isAdmin && (
               <button onClick={() => setAdminView('dashboard')} className="text-brand-primary p-2">
                 <Settings2 size={20} />
               </button>
             )}
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className={`flex-1 relative flex flex-col items-center ${deviceMode === 'mobile' ? 'p-4' : 'justify-center p-10'} transition-colors duration-500 overflow-y-auto w-full`}>
        <AnimatePresence mode="wait">
          {adminView === 'dashboard' ? (
            <motion.div 
              key="admin-dash"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`w-full max-w-4xl glass ${deviceMode === 'mobile' ? 'p-6 rounded-3xl' : 'p-10 rounded-[40px]'} border border-white/10`}
            >
              <div className={`flex ${deviceMode === 'mobile' ? 'flex-col gap-4' : 'justify-between items-center'} mb-10`}>
                <h2 className={`${deviceMode === 'mobile' ? 'text-2xl' : 'text-3xl'} font-serif text-white`}>Admin Dashboard</h2>
                <button onClick={addLesson} className="px-6 py-2 bg-brand-primary text-sm font-bold rounded-full hover:scale-105 transition-transform text-white">
                  + New Module
                </button>
              </div>

              <div className="space-y-4">
                {lessons.map(lesson => (
                  <div key={lesson.id} className="p-4 md:p-6 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between group">
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="text-lg font-medium text-white truncate">{lesson.nomeDaAula}</div>
                      <div className="text-xs text-slate-500 mt-1">{lesson.audios.length} Audio Tracks</div>
                    </div>
                    <div className={`flex gap-3 ${deviceMode === 'desktop' ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'} transition-opacity shrink-0`}>
                      <button 
                        onClick={() => { setEditingLesson(lesson); setAdminView('edit_lesson'); }}
                        className="px-4 py-1.5 rounded-full border border-white/10 text-xs hover:bg-white/10 transition-colors text-white"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => deleteLesson(lesson.id)}
                        className="px-4 py-1.5 rounded-full border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : adminView === 'edit_lesson' && editingLesson ? (
            <motion.div 
              key="edit-lesson"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-4xl"
            >
              <button onClick={() => setAdminView('dashboard')} className="text-xs text-slate-500 hover:text-white mb-6 transition-colors">← Back to Dashboard</button>
              <div className={`glass ${deviceMode === 'mobile' ? 'p-6 rounded-3xl' : 'p-10 rounded-[40px]'} border border-white/10 mb-8`}>
                <label className="text-[10px] uppercase tracking-widest text-brand-primary font-bold block mb-4">Module Title</label>
                <input 
                  type="text" 
                  value={editingLesson.nomeDaAula}
                  onChange={(e) => updateLesson({ ...editingLesson, nomeDaAula: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xl md:text-2xl font-serif outline-none focus:border-brand-primary transition-colors text-white"
                />
              </div>

              <div className={`glass ${deviceMode === 'mobile' ? 'p-6 rounded-3xl' : 'p-10 rounded-[40px]'} border border-white/10`}>
                <div className={`flex ${deviceMode === 'mobile' ? 'flex-col gap-4' : 'justify-between items-center'} mb-8`}>
                  <h3 className="text-xl font-serif text-white">Audio Tracks</h3>
                  <button 
                    onClick={() => addAudio(editingLesson.id)}
                    className="px-6 py-2 border border-brand-primary/50 text-brand-primary text-xs font-bold rounded-full hover:bg-brand-primary/10 transition-colors"
                  >
                    + Add Audio
                  </button>
                </div>
                <div className="space-y-3">
                  {editingLesson.audios.map(audio => (
                    <div key={audio.id} className="p-4 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-4 min-w-0 pr-4">
                        <span className="text-2xl shrink-0">{audio.illustration}</span>
                        <span className="text-sm font-medium text-white truncate">{audio.titulo}</span>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button 
                          onClick={() => { setEditingAudio(audio); setAdminView('edit_audio'); }}
                          className="p-2 text-slate-400 hover:text-white transition-colors"
                        >
                          <Settings2 size={16} />
                        </button>
                        <button 
                          onClick={() => deleteAudio(editingLesson.id, audio.id)}
                          className="p-2 text-red-500/50 hover:text-red-400 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : adminView === 'edit_audio' && editingAudio ? (
            <motion.div 
               key="edit-audio"
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               className="w-full max-w-4xl"
            >
              <button onClick={() => setAdminView('edit_lesson')} className="text-xs text-slate-500 hover:text-white mb-6 transition-colors">← Back to Lesson</button>
              <div className={`glass ${deviceMode === 'mobile' ? 'p-6 rounded-3xl' : 'p-10 rounded-[40px]'} border border-white/10 space-y-8`}>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-brand-primary font-bold block mb-4">Track Detail</label>
                  <div className={`grid ${deviceMode === 'mobile' ? 'grid-cols-1' : 'grid-cols-4'} gap-4`}>
                    <input 
                      type="text" 
                      placeholder="Title"
                      value={editingAudio.titulo}
                      onChange={(e) => updateAudio({ ...editingAudio, titulo: e.target.value })}
                      className={`${deviceMode === 'mobile' ? 'w-full' : 'col-span-3'} bg-white/5 border border-white/10 rounded-xl p-4 text-lg outline-none focus:border-brand-primary transition-colors text-white`}
                    />
                    <div className="flex gap-4">
                      <input 
                        type="text" 
                        placeholder="Icon"
                        value={editingAudio.illustration}
                        onChange={(e) => updateAudio({ ...editingAudio, illustration: e.target.value })}
                        className="bg-white/5 border border-white/10 rounded-xl p-4 text-2xl text-center outline-none focus:border-brand-primary transition-colors text-white w-20"
                      />
                      <div className="flex-1 flex items-center text-[10px] text-slate-500 italic">
                        Tip: Use emojis for track icons
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-brand-primary font-bold block mb-4 flex justify-between">
                    <span>Lesson Transcript</span>
                    <span className="text-slate-500">Use [PAUSA 2] for timing</span>
                  </label>
                  <textarea 
                    value={editingAudio.texto}
                    onChange={(e) => updateAudio({ ...editingAudio, texto: e.target.value })}
                    className="w-full h-80 bg-white/5 border border-white/10 rounded-2xl p-6 text-base md:text-lg font-serif leading-relaxed outline-none focus:border-brand-primary transition-colors custom-scrollbar resize-none text-white"
                    placeholder="Enter lesson text here... [PAUSA 2] Hello world!"
                  />
                </div>

                <div className="pt-6 flex justify-end">
                   <button 
                    onClick={() => setAdminView('edit_lesson')}
                    className="w-full md:w-auto px-10 py-4 bg-brand-primary font-bold rounded-full shadow-lg hover:scale-105 transition-transform text-white"
                   >
                     Done Editing
                   </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="w-full max-w-[600px] text-center">
              <PlayerContent 
                audio={selectedAudio} 
                voice={getVoice()} 
                voiceType={voiceType}
                deviceMode={deviceMode}
                playerMode={playerMode}
                setPlayerMode={setPlayerMode}
                onVoiceSelect={(type) => setVoiceType(type)}
              />
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

const PlayerContent: React.FC<{ 
  audio: AudioData; 
  voice: SpeechSynthesisVoice | null;
  voiceType: 'UK-M' | 'UK-F' | 'US-F';
  deviceMode: 'mobile' | 'desktop';
  playerMode: 'focus' | 'audio';
  setPlayerMode: (mode: 'focus' | 'audio') => void;
  onVoiceSelect: (type: 'UK-M' | 'UK-F' | 'US-F') => void;
}> = ({ 
  audio, 
  voice,
  voiceType,
  deviceMode,
  playerMode,
  setPlayerMode,
  onVoiceSelect
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  
  const chunksRef = useRef<Chunk[]>([]);
  const totalDurationRef = useRef(0);
  const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const { chunks, totalDuration } = parseChunks(audio.texto);
    chunksRef.current = chunks;
    totalDurationRef.current = totalDuration;
    
    // Reset on audio change
    setCurrentChunkIndex(0);
    setCurrentTime(0);
    stopAudio();
    
    return () => {
      stopAudio();
    };
  }, [audio.id]);

  const stopAudio = useCallback(() => {
    setIsPlaying(false);
    window.speechSynthesis.cancel();
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
  }, []);

  const playChunk = useCallback((index: number) => {
    if (index >= chunksRef.current.length) {
      stopAudio();
      return;
    }

    const chunk = chunksRef.current[index];
    setCurrentChunkIndex(index);
    setCurrentTime(chunk.start);

    if (chunk.type === 'pause') {
      pauseTimeoutRef.current = setTimeout(() => {
        playChunk(index + 1);
      }, chunk.duration * 1000);
    } else {
      const utterance = new SpeechSynthesisUtterance(chunk.content);
      if (voice) utterance.voice = voice;
      utterance.onend = () => {
        playChunk(index + 1);
      };
      window.speechSynthesis.speak(utterance);
    }
  }, [voice, stopAudio]);

  const togglePlay = () => {
    if (isPlaying) {
      stopAudio();
    } else {
      setIsPlaying(true);
      playChunk(currentChunkIndex);
      
      progressIntervalRef.current = setInterval(() => {
        setCurrentTime(prev => {
          const next = prev + 0.1;
          if (next >= totalDurationRef.current) return totalDurationRef.current;
          return next;
        });
      }, 100);
    }
  };

  const skipRelative = (dir: number) => {
    stopAudio();
    const nextIdx = Math.max(0, Math.min(chunksRef.current.length - 1, currentChunkIndex + dir));
    setCurrentChunkIndex(nextIdx);
    setCurrentTime(chunksRef.current[nextIdx].start);
    if (isPlaying) {
      setIsPlaying(true);
      playChunk(nextIdx);
    }
  };

  const chunks = chunksRef.current;
  const currentChunk = chunks[currentChunkIndex];
  
  // Find non-pause neighbor text chunks for the sandwich view
  const getNeighbor = (dir: number) => {
    let idx = currentChunkIndex + dir;
    while (idx >= 0 && idx < chunks.length) {
      if (chunks[idx].type === 'text') return chunks[idx];
      idx += dir;
    }
    return null;
  };

  const prevChunk = getNeighbor(-1);
  const nextChunk = getNeighbor(1);
  const isPause = currentChunk?.type === 'pause';

  const progressPercent = totalDurationRef.current > 0 ? (currentTime / totalDurationRef.current) * 100 : 0;

  return (
    <div className={`flex flex-col items-center w-full max-w-[600px] mx-auto ${deviceMode === 'mobile' ? 'h-full justify-between pb-8' : 'justify-center min-h-[600px]'}`}>
      
      {/* Mode Selector Toggle */}
      <div className="flex bg-white/5 p-1 rounded-2xl mb-8 md:mb-12 border border-white/5 relative z-10 scale-90 md:scale-100">
        <button 
          onClick={() => setPlayerMode('focus')}
          className={`px-5 py-2 rounded-xl text-[10px] font-bold tracking-widest transition-all ${playerMode === 'focus' ? 'bg-brand-primary text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          FOCUS MODE
        </button>
        <button 
          onClick={() => setPlayerMode('audio')}
          className={`px-5 py-2 rounded-xl text-[10px] font-bold tracking-widest transition-all ${playerMode === 'audio' ? 'bg-brand-primary text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          JUST AUDIO
        </button>
      </div>

      <h2 className={`text-white font-serif mb-6 md:mb-12 tracking-tight text-center ${deviceMode === 'mobile' ? 'text-2xl px-4' : 'text-5xl'}`}>{audio.titulo}</h2>

      {/* Conditional Rendering: Transcript or Audio Visualizer */}
      <div className={`w-full flex-1 flex flex-col justify-center mb-6 md:mb-12 relative overflow-hidden transition-all duration-700 ${playerMode === 'audio' ? 'opacity-50 scale-90' : 'opacity-100'}`}>
        <AnimatePresence mode="wait">
          {playerMode === 'focus' ? (
            <motion.div 
              key="focus-view"
              initial={{ opacity: 0, filter: 'blur(10px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(10px)' }}
              className="flex flex-col gap-4 md:gap-8 h-full"
            >
              {/* Previous */}
              <div className="h-[20%] flex items-end justify-center min-h-[60px]">
                <AnimatePresence mode="wait">
                  {prevChunk && (
                    <motion.p 
                      key={prevChunk.content}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 0.2, scale: 0.95 }}
                      exit={{ opacity: 0 }}
                      className={`font-serif leading-relaxed text-white text-center italic ${deviceMode === 'mobile' ? 'text-md max-w-[80%]' : 'text-2xl'}`}
                    >
                      {prevChunk.content}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Current */}
              <div className="h-[40%] flex items-center justify-center relative px-4 min-h-[120px]">
                <AnimatePresence mode="wait">
                  {isPause ? (
                    <motion.div 
                      key="pause-indicator"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex gap-2"
                    >
                      {[0, 1, 2].map(i => (
                        <motion.div 
                          key={i}
                          animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }} 
                          transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }} 
                          className="w-2.5 h-2.5 rounded-full bg-brand-primary" 
                        />
                      ))}
                    </motion.div>
                  ) : (
                    <motion.p 
                      key={currentChunk?.content}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={`font-serif leading-relaxed text-white text-center font-bold drop-shadow-[0_0_20px_rgba(255,255,255,0.4)] ${deviceMode === 'mobile' ? 'text-xl' : 'text-4xl'}`}
                    >
                      {currentChunk?.content}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Next */}
              <div className="h-[20%] flex items-start justify-center min-h-[60px]">
                <AnimatePresence mode="wait">
                  {nextChunk && (
                    <motion.p 
                      key={nextChunk.content}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 0.2, scale: 0.95 }}
                      exit={{ opacity: 0 }}
                      className={`font-serif leading-relaxed text-white text-center italic ${deviceMode === 'mobile' ? 'text-md max-w-[80%]' : 'text-2xl'}`}
                    >
                      {nextChunk.content}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="audio-view"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center justify-center h-full"
            >
              <div className="p-12 rounded-[40px] bg-white/[0.02] border border-white/5 relative group">
                <div className="absolute inset-0 bg-brand-primary/10 blur-[100px] opacity-20 group-hover:opacity-40 transition-opacity" />
                <Headphones size={120} className="text-white opacity-20 relative z-10" />
                
                {/* Visualizer feedback bars */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-end gap-1.5 h-12">
                   {[...Array(5)].map((_, i) => (
                     <motion.div 
                      key={i}
                      animate={isPlaying ? { height: [12, 48, 20, 40, 12] } : { height: 8 }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                      className="w-1.5 rounded-full bg-brand-primary/40"
                     />
                   ))}
                </div>
              </div>
              <p className="mt-12 text-slate-500 font-bold tracking-[0.2em] text-[10px] uppercase">Audio Streaming</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={`w-full ${deviceMode === 'mobile' ? 'px-6' : 'max-w-md mx-auto'} mb-8`}>
        <div className="h-[4px] w-full bg-white/5 rounded-full relative mb-4">
          <motion.div 
            className="absolute left-0 top-0 h-full bg-brand-primary shadow-[0_0_10px_rgba(129,140,248,0.5)] rounded-full"
            animate={{ width: `${progressPercent}%` }}
            transition={{ type: 'spring', bounce: 0, duration: 0.2 }}
          />
        </div>
        <div className="flex justify-between text-[11px] font-mono text-slate-500 tracking-wider">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalDurationRef.current)}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-10 md:gap-12 mb-12">
        <button 
          onClick={() => skipRelative(-1)}
          className="text-slate-400 hover:text-white transition-colors p-2"
        >
          <SkipBack size={deviceMode === 'mobile' ? 24 : 26} />
        </button>
        <button 
          onClick={togglePlay}
          className={`rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl ${deviceMode === 'mobile' ? 'w-20 h-20' : 'w-[72px] h-[72px]'}`}
        >
          {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
        </button>
        <button 
          onClick={() => skipRelative(1)}
          className="text-slate-400 hover:text-white transition-colors p-2"
        >
          <SkipForward size={24} />
        </button>
      </div>

      {/* Voice Selection Menu */}
      <div className={`${deviceMode === 'mobile' ? 'relative w-[calc(100%-3rem)]' : 'absolute bottom-10 right-10'} z-50`}>
        <AnimatePresence>
          {showVoiceMenu && (
            <motion.div 
               initial={{ opacity: 0, y: 10, scale: 0.95 }}
               animate={{ opacity: 1, y: 0, scale: 1 }}
               exit={{ opacity: 0, y: 10, scale: 0.95 }}
               className="absolute bottom-full right-0 mb-4 w-56 glass border border-white/10 rounded-2xl p-2 shadow-2xl overflow-hidden"
            >
              {[
                { id: 'UK-F', label: 'a) British Female' },
                { id: 'UK-M', label: 'b) British Male' },
                { id: 'US-F', label: 'c) American Female' }
              ].map((v) => (
                <button 
                  key={v.id}
                  onClick={() => {
                    onVoiceSelect(v.id as any);
                    setShowVoiceMenu(false);
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${voiceType === v.id ? 'bg-brand-primary text-white' : 'hover:bg-white/5 text-slate-400 font-medium'}`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${voiceType === v.id ? 'bg-white shadow-[0_0_8px_white]' : 'bg-slate-700'}`} />
                  <div className="text-left">
                    <div className="text-[11px] font-bold tracking-tight leading-none">{v.label}</div>
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <button 
          onClick={() => setShowVoiceMenu(!showVoiceMenu)}
          className={`flex items-center justify-center gap-3 px-6 py-3 rounded-full glass border border-white/10 text-xs text-slate-300 hover:text-white transition-all group mx-auto mb-4 w-full h-12 shadow-xl`}
        >
          <div className="w-2.5 h-2.5 rounded-full bg-brand-accent shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <span className="font-medium whitespace-nowrap">Voice: {
            voiceType === 'UK-F' ? 'British Female' : 
            voiceType === 'UK-M' ? 'British Male' : 'American Female'
          }</span>
          <motion.div animate={{ rotate: showVoiceMenu ? 180 : 0 }}>
            <ChevronDown size={14} className="ml-auto" />
          </motion.div>
        </button>
      </div>
    </div>
  );
};
