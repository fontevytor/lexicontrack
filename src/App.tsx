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
  Volume2,
  Sun,
  Moon,
  LogOut,
  CloudUpload
} from 'lucide-react';
import { LESSONS } from './data';
import { AudioData, LessonData, Chunk } from './types';
import { db, auth, signInWithGoogle } from './lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy,
  getDocs,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';

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
      {/* Outer Triangle */}
      <motion.path 
        d="M 50 10 L 90 85 L 10 85 Z" 
        fill="currentColor" 
        className="text-white body-light:text-slate-900 transition-colors duration-500"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
      />
      {/* Inner Triangle */}
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
  const [lessons, setLessons] = useState<LessonData[]>(LESSONS);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isCloudSynced, setIsCloudSynced] = useState(false);

  const [currentView, setCurrentView] = useState<'menu' | 'app'>('menu');
  const [deviceMode, setDeviceMode] = useState<'mobile' | 'desktop'>('desktop');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('lexicon_theme');
    return (saved as 'dark' | 'light') || 'dark';
  });
  const [showMobileModules, setShowMobileModules] = useState(false);
  
  const [selectedAudio, setSelectedAudio] = useState<AudioData>(LESSONS[0].audios[0]);
  const [activeLessonId, setActiveLessonId] = useState<string>(LESSONS[0].id);
  const [playerMode, setPlayerMode] = useState<'focus' | 'audio'>('focus');
  const [voiceType, setVoiceType] = useState<'UK-M' | 'UK-F'>('UK-F');
  const [allVoices, setAllVoices] = useState<SpeechSynthesisVoice[]>([]);
  
  // Admin UI State
  const [showLogin, setShowLogin] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [adminView, setAdminView] = useState<'dashboard' | 'edit_lesson' | 'edit_audio' | null>(null);
  const [editingLesson, setEditingLesson] = useState<LessonData | null>(null);
  const [editingAudio, setEditingAudio] = useState<AudioData | null>(null);

  // Firestore Sync
  useEffect(() => {
    const q = query(collection(db, 'lessons'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => doc.data() as LessonData);
      if (docs.length > 0) {
        setLessons(docs);
        setIsCloudSynced(true);
      } else {
        setIsCloudSynced(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Auth State
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Check if user is in admins collection
        const adminDoc = await getDocs(query(collection(db, 'admins')));
        const adminIds = adminDoc.docs.map(d => d.id);
        
        // Also check localStorage passcode for session continuity
        const sessionPasscode = localStorage.getItem('lexicon_admin_session');
        if (adminIds.includes(u.uid) || u.email === 'fontevytor@gmail.com' || sessionPasscode === 'admin12345') {
          setIsAdmin(true);
        }
      } else {
        setIsAdmin(false);
      }
      setAuthReady(true);
    });
  }, []);

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
    localStorage.setItem('lexicon_theme', theme);
    if (theme === 'light') {
      document.body.classList.add('light');
    } else {
      document.body.classList.remove('light');
    }
  }, [theme]);

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setAllVoices(voices);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    // Mobile fallback: poll for voices a few times if list is empty
    const timer = setInterval(() => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) {
        setAllVoices(v);
        clearInterval(timer);
      }
    }, 1000);

    return () => {
      clearInterval(timer);
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const getVoice = useCallback(() => {
    const findVoice = (lang: string, gender: 'Male' | 'Female') => {
      // 1. Strict filter by exact language (British English)
      let candidates = allVoices.filter(v => v.lang === lang || v.lang === lang.replace('-', '_'));
      
      // 2. If no exact match (like en-GB), try startsWith
      if (candidates.length === 0) {
        candidates = allVoices.filter(v => v.lang.startsWith(lang.split('-')[0]));
      }

      const maleNames = ['daniel', 'oliver', 'harry', 'arthur', 'george', 'david', 'james', 'guy', 'liam', 'peter', 'andrew'];
      const femaleNames = ['serena', 'emma', 'martha', 'stephanie', 'alice', 'samantha', 'zira', 'amy', 'libby', 'victoria', 'susan'];

      const isMale = (v: SpeechSynthesisVoice) => {
        const name = v.name.toLowerCase();
        if (name.includes('male') && !name.includes('female')) return true;
        return maleNames.some(target => name.includes(target));
      };

      const isFemale = (v: SpeechSynthesisVoice) => {
        const name = v.name.toLowerCase();
        if (name.includes('female')) return true;
        return femaleNames.some(target => name.includes(target));
      };

      const genderFiltered = candidates.filter(v => 
        gender === 'Male' ? isMale(v) : isFemale(v)
      );

      // Tier 1: Premium/High Quality voices (Neural, Natural, Google)
      const premium = genderFiltered.filter(v => 
        v.name.includes('Google') || v.name.includes('Neural') || v.name.includes('Natural') || v.name.includes('Online')
      );

      if (premium.length > 0) return premium[0];
      
      // Tier 2: Best common names for British English
      const bestName = genderFiltered.find(v => {
        const name = v.name.toLowerCase();
        if (gender === 'Male') return name.includes('daniel') || name.includes('harry');
        return name.includes('serena') || name.includes('emma');
      });
      if (bestName) return bestName;

      // Tier 3: Any gender filtered match
      if (genderFiltered.length > 0) return genderFiltered[0];
      
      // Tier 4: Fallback to any voice with that language
      return candidates[0] || null;
    };

    if (voiceType === 'UK-M') return findVoice('en-GB', 'Male');
    if (voiceType === 'UK-F') return findVoice('en-GB', 'Female');

    return allVoices.find(v => v.lang.startsWith('en')) || null;
  }, [allVoices, voiceType]);

  const migrateToCloud = async () => {
    if (!isAdmin) return;
    try {
      const batch = writeBatch(db);
      lessons.forEach((lesson, index) => {
        const lessonRef = doc(db, 'lessons', lesson.id);
        batch.set(lessonRef, {
          ...lesson,
          order: index,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
      alert("Database successfully migrated to Cloud!");
    } catch (err) {
      console.error(err);
      alert("Migration failed. Check permissions.");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "admin12345") {
      try {
        if (!user) {
          await signInWithGoogle();
        }
        localStorage.setItem('lexicon_admin_session', 'admin12345');
        setIsAdmin(true);
        setShowLogin(false);
        setLoginError("");
        setAdminView('dashboard');
        setCurrentView('app');
      } catch (err) {
        setLoginError("Login failed. Please check browser popups.");
      }
    } else {
      setLoginError("Invalid Passcode. Please try again.");
      setPassword("");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('lexicon_admin_session');
    setIsAdmin(false);
    setAdminView(null);
  };

  // CRUD Actions
  const addLesson = async () => {
    const newLesson: LessonData = {
      id: `lesson-${Date.now()}`,
      nomeDaAula: "New Lesson",
      audios: []
    };
    
    if (isAdmin) {
      try {
        await setDoc(doc(db, 'lessons', newLesson.id), {
          ...newLesson,
          order: lessons.length,
          updatedAt: serverTimestamp()
        });
        setEditingLesson(newLesson);
        setAdminView('edit_lesson');
      } catch (err) {
        console.error(err);
        alert("Failed to save to cloud.");
      }
    } else {
      setLessons([...lessons, newLesson]);
      setEditingLesson(newLesson);
      setAdminView('edit_lesson');
    }
  };

  const deleteLesson = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Module",
      message: "Are you sure you want to remove this entire module and all its audio tracks?",
      onConfirm: async () => {
        if (isAdmin) {
          try {
            await deleteDoc(doc(db, 'lessons', id));
          } catch (err) {
             console.error(err);
          }
        }
        const filtered = lessons.filter(l => l.id !== id);
        if (!isAdmin) setLessons(filtered);
        
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

  const updateLesson = async (updated: LessonData) => {
    if (isAdmin) {
      try {
        await setDoc(doc(db, 'lessons', updated.id), {
          ...updated,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.error(err);
      }
    } else {
      setLessons(lessons.map(l => l.id === updated.id ? updated : l));
    }
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
      <div className="h-screen w-screen bg-[#050507] body-light:bg-slate-50 flex flex-col items-center justify-center p-6 transition-colors duration-500 relative overflow-hidden">
        {/* Abstract background elements for theme variation */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-brand-primary/10 body-light:bg-brand-primary/5 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-secondary/20 body-light:bg-slate-200/50 blur-[120px] rounded-full" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16 relative z-10"
        >
          <div className="mb-10 flex justify-center scale-150">
            <Logo size={64} />
          </div>
          <h1 className="text-6xl md:text-7xl font-serif text-white body-light:text-slate-900 tracking-tighter mb-4 italic transition-all duration-500 drop-shadow-[0_0_30px_rgba(255,255,255,0.3)] body-light:drop-shadow-none">
            LexiconTrack
          </h1>
          <p className="text-white/70 body-light:text-slate-500 uppercase tracking-[0.4em] font-bold text-[10px] md:text-xs transition-colors duration-500">
            LexiconKey audio database
          </p>
        </motion.div>

        <div className="flex flex-col gap-4 w-full max-w-sm">
          <button 
            onClick={() => setCurrentView('app')}
            className="w-full h-16 rounded-2xl bg-white body-light:bg-brand-primary text-black body-light:text-white font-bold text-lg hover:scale-[1.02] active:scale-[0.98] shadow-2xl transition-all flex items-center justify-center gap-3"
          >
            STUDENT ACCESS
          </button>
          <button 
            onClick={() => setShowLogin(true)}
            className="w-full h-16 rounded-2xl border border-white/10 body-light:border-slate-200 text-white body-light:text-slate-900 font-bold text-lg hover:bg-white/5 body-light:hover:bg-slate-100 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
          >
            ADMIN PANEL
          </button>
        </div>

        <div className="mt-20 flex items-center gap-6 p-4 rounded-3xl bg-white/5 body-light:bg-slate-100 border border-white/5 body-light:border-slate-200">
          <div className="flex gap-2">
            <button 
              onClick={() => setDeviceMode('desktop')}
              className={`px-6 py-3 rounded-2xl transition-all flex items-center gap-2 text-xs font-bold ${deviceMode === 'desktop' ? 'bg-white/10 body-light:bg-white text-white body-light:text-brand-primary shadow-sm' : 'text-slate-500 hover:text-slate-300 body-light:hover:text-slate-600'}`}
            >
              COMPUTER
            </button>
            <button 
              onClick={() => setDeviceMode('mobile')}
              className={`px-6 py-3 rounded-2xl transition-all flex items-center gap-2 text-xs font-bold ${deviceMode === 'mobile' ? 'bg-white/10 body-light:bg-white text-white body-light:text-brand-primary shadow-sm' : 'text-slate-500 hover:text-slate-300 body-light:hover:text-slate-600'}`}
            >
              MOBILE
            </button>
          </div>
          <div className="w-px h-8 bg-white/10 body-light:bg-slate-200 mx-2" />
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-12 h-12 rounded-2xl bg-white/10 body-light:bg-white border border-white/10 body-light:border-slate-200 text-white body-light:text-slate-900 flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-sm"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
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
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 body-light:bg-white/90 backdrop-blur-md p-6"
            >
              <motion.form 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onSubmit={handleLogin}
                className="w-full max-w-sm glass border border-white/10 body-light:border-slate-200 p-10 rounded-[32px] shadow-2xl"
              >
                <h3 className="text-2xl font-serif mb-8 text-center text-white body-light:text-slate-900">Admin Security</h3>
                <input 
                  type="password" 
                  autoFocus
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (loginError) setLoginError("");
                  }}
                  placeholder="Enter Passcode..."
                  className={`w-full bg-white/5 body-light:bg-white border ${loginError ? 'border-red-500/50' : 'border-white/10 body-light:border-slate-200'} rounded-2xl p-4 text-center text-lg outline-none focus:border-brand-primary transition-colors mb-2 text-white body-light:text-slate-900`}
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
               className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 body-light:bg-white/80 backdrop-blur-sm p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full max-w-sm glass border border-white/10 body-light:border-slate-200 p-8 rounded-[32px] shadow-2xl"
              >
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6 text-red-500">
                  <X size={24} />
                </div>
                <h3 className="text-xl font-serif text-white body-light:text-slate-900 mb-3">{confirmDialog.title}</h3>
                <p className="text-slate-400 body-light:text-slate-600 text-sm mb-8 leading-relaxed">{confirmDialog.message}</p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                    className="flex-1 py-3 text-xs font-bold text-slate-500 hover:text-white body-light:hover:text-slate-900 transition-colors"
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
    <div className={`flex h-screen w-screen bg-[#050507] body-light:bg-slate-50 transition-colors duration-500 ${deviceMode === 'mobile' ? 'flex-col' : 'flex-row'} overflow-hidden relative`}>
      {/* Theme Toggle Floating (Optional, maybe keep in sidebar) */}
      
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
              className="fixed left-0 top-0 bottom-0 w-[85%] max-w-[320px] bg-[#0A0A0E] body-light:bg-white border-r border-white/10 body-light:border-slate-200 z-[70] p-8 flex flex-col"
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
                      className={`p-4 rounded-2xl border transition-all ${activeLessonId === lesson.id ? 'bg-brand-primary/10 border-brand-primary/30' : 'bg-white/[0.03] body-light:bg-slate-50 border-white/5 body-light:border-slate-200'}`}
                      onClick={() => setActiveLessonId(lesson.id)}
                    >
                      <div className={`font-bold text-sm ${activeLessonId === lesson.id || theme === 'dark' ? 'text-white body-light:text-brand-primary' : 'text-slate-900'}`}>{lesson.nomeDaAula}</div>
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
                              className={`w-full text-left text-xs p-3 pl-6 rounded-xl transition-colors ${selectedAudio.id === audio.id ? 'bg-white/5 body-light:bg-slate-100 text-brand-primary font-bold' : 'text-slate-500'}`}
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

              <div className="mt-8 pt-6 border-t border-white/5 body-light:border-slate-100">
                 <button 
                  onClick={() => { setCurrentView('menu'); setShowMobileModules(false); }}
                  className="w-full py-4 text-xs font-bold tracking-widest text-slate-500 hover:text-white body-light:hover:text-slate-900 uppercase"
                 >
                   Back to Home
                 </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Sidebar (Top bar for mobile) */}
      <aside className={`${deviceMode === 'mobile' ? 'w-full h-[64px] border-b' : 'w-[320px] h-full border-r'} border-white/10 body-light:border-slate-200 bg-black/40 body-light:bg-white/90 backdrop-blur-xl ${deviceMode === 'mobile' ? 'px-6 py-0' : 'p-10'} flex ${deviceMode === 'mobile' ? 'flex-row items-center justify-between' : 'flex-col'} shrink-0 z-40 transition-colors duration-500`}>
        <div 
          className="flex items-center gap-3 cursor-pointer" 
          onClick={() => { setCurrentView('menu'); setIsAdmin(false); setAdminView(null); }}
        >
          <Logo size={24} />
          <span className="text-md font-bold tracking-tight text-white body-light:text-slate-900 italic transition-colors">LexiconTrack</span>
        </div>

        {deviceMode === 'mobile' && !adminView && (
          <div className="flex items-center gap-2">
             <button 
              onClick={() => setShowMobileModules(true)}
              className="text-white body-light:text-slate-900 p-3 hover:bg-white/5 body-light:hover:bg-slate-100 rounded-full transition-colors"
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
                  className={`mb-3 p-4 rounded-xl border transition-all cursor-pointer ${activeLessonId === lesson.id && !adminView ? 'bg-brand-primary/10 border-brand-primary/50' : 'bg-white/[0.03] body-light:bg-slate-50 border-white/10 body-light:border-slate-200 hover:bg-white/5 body-light:hover:bg-white'}`}
                  onClick={() => { setActiveLessonId(lesson.id); setAdminView(null); }}
                >
                  <div className={`font-semibold text-sm mb-2 ${activeLessonId === lesson.id && !adminView ? 'text-white body-light:text-brand-primary' : 'text-slate-400 body-light:text-slate-600 hover:text-white body-light:hover:text-slate-900'}`}>{lesson.nomeDaAula}</div>
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
                            className={`text-xs p-2 pl-6 relative transition-colors ${selectedAudio.id === audio.id ? 'text-brand-primary font-medium' : 'text-slate-400 body-light:text-slate-500 hover:text-white body-light:hover:text-slate-900'}`}
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

            <div className="mt-8 pt-6 border-t border-white/5 body-light:border-slate-100 flex flex-col gap-4">
              <div className="flex items-center justify-between mb-2">
                <button 
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="p-2 rounded-lg bg-white/5 body-light:bg-slate-100 border border-white/10 body-light:border-slate-200 text-white body-light:text-slate-900 hover:scale-105 transition-all"
                  title="Toggle Theme"
                >
                  {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                </button>
                <div className="w-px h-4 bg-white/10 body-light:bg-slate-200 mx-2" />
                <button 
                  onClick={() => setAdminView('dashboard')}
                  className={`flex items-center gap-2 text-[10px] uppercase tracking-widest transition-colors font-bold ${isAdmin ? 'text-brand-primary' : 'text-slate-500'}`}
                >
                  <Settings2 size={12} /> {isAdmin ? "ADMIN DASHBOARD" : "LOCK"}
                </button>
              </div>
              <div className="text-[10px] text-slate-500 text-center opacity-40 uppercase tracking-widest font-bold">
                © 2026 Nody Editora
              </div>
            </div>
          </>
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
              className={`w-full max-w-4xl glass ${deviceMode === 'mobile' ? 'p-6 rounded-3xl' : 'p-10 rounded-[40px]'} border border-white/10 body-light:border-slate-200`}
            >
              <div className={`flex ${deviceMode === 'mobile' ? 'flex-col gap-4' : 'justify-between items-center'} mb-10`}>
                <div className="flex flex-col">
                  <h2 className={`${deviceMode === 'mobile' ? 'text-2xl' : 'text-3xl'} font-serif text-white body-light:text-slate-900`}>Admin Dashboard</h2>
                  {!isCloudSynced && (
                    <button 
                      onClick={migrateToCloud}
                      className="text-[10px] text-brand-primary flex items-center gap-1 mt-1 hover:underline"
                    >
                      <CloudUpload size={10} /> Database not synced. Migrate local to Cloud?
                    </button>
                  )}
                </div>
                <div className="flex gap-3">
                  <button onClick={handleLogout} className="px-6 py-2 border border-white/10 text-slate-400 text-sm font-bold rounded-full hover:bg-white/5 transition-colors flex items-center gap-2">
                    <LogOut size={14} /> Logout
                  </button>
                  <button onClick={addLesson} className="px-6 py-2 bg-brand-primary text-sm font-bold rounded-full hover:scale-105 transition-transform text-white">
                    + New Module
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {lessons.map(lesson => (
                  <div key={lesson.id} className="p-4 md:p-6 rounded-2xl bg-white/5 body-light:bg-slate-50 border border-white/5 body-light:border-slate-200 flex items-center justify-between group">
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="text-lg font-medium text-white body-light:text-slate-800 truncate">{lesson.nomeDaAula}</div>
                      <div className="text-xs text-slate-500 mt-1">{lesson.audios.length} Audio Tracks</div>
                    </div>
                    <div className={`flex gap-3 ${deviceMode === 'desktop' ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'} transition-opacity shrink-0`}>
                      <button 
                        onClick={() => { setEditingLesson(lesson); setAdminView('edit_lesson'); }}
                        className="px-4 py-1.5 rounded-full border border-white/10 body-light:border-slate-300 text-xs hover:bg-white/10 body-light:hover:bg-slate-100 transition-colors text-white body-light:text-slate-700"
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
              <button onClick={() => setAdminView('dashboard')} className="text-xs text-slate-500 hover:text-white body-light:hover:text-slate-900 mb-6 transition-colors">← Back to Dashboard</button>
              <div className={`glass ${deviceMode === 'mobile' ? 'p-6 rounded-3xl' : 'p-10 rounded-[40px]'} border border-white/10 body-light:border-slate-200 mb-8`}>
                <label className="text-[10px] uppercase tracking-widest text-brand-primary font-bold block mb-4">Module Title</label>
                <input 
                  type="text" 
                  value={editingLesson.nomeDaAula}
                  onChange={(e) => updateLesson({ ...editingLesson, nomeDaAula: e.target.value })}
                  className="w-full bg-white/5 body-light:bg-white border border-white/10 body-light:border-slate-200 rounded-2xl p-4 text-xl md:text-2xl font-serif outline-none focus:border-brand-primary transition-colors text-white body-light:text-slate-900"
                />
              </div>

              <div className={`glass ${deviceMode === 'mobile' ? 'p-6 rounded-3xl' : 'p-10 rounded-[40px]'} border border-white/10 body-light:border-slate-200`}>
                <div className={`flex ${deviceMode === 'mobile' ? 'flex-col gap-4' : 'justify-between items-center'} mb-8`}>
                  <h3 className="text-xl font-serif text-white body-light:text-slate-900">Audio Tracks</h3>
                  <button 
                    onClick={() => addAudio(editingLesson.id)}
                    className="px-6 py-2 border border-brand-primary/50 text-brand-primary text-xs font-bold rounded-full hover:bg-brand-primary/10 transition-colors"
                  >
                    + Add Audio
                  </button>
                </div>
                <div className="space-y-3">
                  {editingLesson.audios.map(audio => (
                    <div key={audio.id} className="p-4 rounded-xl bg-white/[0.03] body-light:bg-slate-50 border border-white/5 body-light:border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-4 min-w-0 pr-4">
                        <span className="text-2xl shrink-0">{audio.illustration}</span>
                        <span className="text-sm font-medium text-white body-light:text-slate-800 truncate">{audio.titulo}</span>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button 
                          onClick={() => { setEditingAudio(audio); setAdminView('edit_audio'); }}
                          className="p-2 text-slate-400 hover:text-white body-light:hover:text-slate-900 transition-colors"
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
              <button onClick={() => setAdminView('edit_lesson')} className="text-xs text-slate-500 hover:text-white body-light:hover:text-slate-900 mb-6 transition-colors">← Back to Lesson</button>
              <div className={`glass ${deviceMode === 'mobile' ? 'p-6 rounded-3xl' : 'p-10 rounded-[40px]'} border border-white/10 body-light:border-slate-200 space-y-8`}>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-brand-primary font-bold block mb-4">Track Detail</label>
                  <div className={`grid ${deviceMode === 'mobile' ? 'grid-cols-1' : 'grid-cols-4'} gap-4`}>
                    <input 
                      type="text" 
                      placeholder="Title"
                      value={editingAudio.titulo}
                      onChange={(e) => updateAudio({ ...editingAudio, titulo: e.target.value })}
                      className={`${deviceMode === 'mobile' ? 'w-full' : 'col-span-3'} bg-white/5 body-light:bg-white border border-white/10 body-light:border-slate-200 rounded-xl p-4 text-lg outline-none focus:border-brand-primary transition-colors text-white body-light:text-slate-900`}
                    />
                    <div className="flex gap-4">
                      <input 
                        type="text" 
                        placeholder="Icon"
                        value={editingAudio.illustration}
                        onChange={(e) => updateAudio({ ...editingAudio, illustration: e.target.value })}
                        className="bg-white/5 body-light:bg-white border border-white/10 body-light:border-slate-200 rounded-xl p-4 text-2xl text-center outline-none focus:border-brand-primary transition-colors text-white body-light:text-slate-900 w-20"
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
                    className="w-full h-80 bg-white/5 body-light:bg-white border border-white/10 body-light:border-slate-200 rounded-2xl p-6 text-base md:text-lg font-serif leading-relaxed outline-none focus:border-brand-primary transition-colors custom-scrollbar resize-none text-white body-light:text-slate-900"
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
  voiceType: 'UK-M' | 'UK-F';
  deviceMode: 'mobile' | 'desktop';
  playerMode: 'focus' | 'audio';
  setPlayerMode: (mode: 'focus' | 'audio') => void;
  onVoiceSelect: (type: 'UK-M' | 'UK-F') => void;
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
      <div className="flex bg-white/5 body-light:bg-slate-100 p-1 rounded-2xl mb-8 md:mb-12 border border-white/5 body-light:border-slate-200 relative z-10 scale-90 md:scale-100">
        <button 
          onClick={() => setPlayerMode('focus')}
          className={`px-5 py-2 rounded-xl text-[10px] font-bold tracking-widest transition-all ${playerMode === 'focus' ? 'bg-brand-primary text-white shadow-lg' : 'text-slate-500 hover:text-slate-300 body-light:hover:text-slate-600'}`}
        >
          FOCUS MODE
        </button>
        <button 
          onClick={() => setPlayerMode('audio')}
          className={`px-5 py-2 rounded-xl text-[10px] font-bold tracking-widest transition-all ${playerMode === 'audio' ? 'bg-brand-primary text-white shadow-lg' : 'text-slate-500 hover:text-slate-300 body-light:hover:text-slate-600'}`}
        >
          JUST AUDIO
        </button>
      </div>

      <h2 className={`text-white body-light:text-slate-900 font-serif mb-6 md:mb-12 tracking-tight text-center ${deviceMode === 'mobile' ? 'text-2xl px-4' : 'text-5xl'}`}>{audio.titulo}</h2>

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
                      className={`font-serif leading-relaxed text-white body-light:text-slate-900 text-center italic ${deviceMode === 'mobile' ? 'text-md max-w-[80%]' : 'text-2xl'}`}
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
                      className={`font-serif leading-relaxed text-white body-light:text-slate-900 text-center font-bold drop-shadow-[0_0_20px_rgba(255,255,255,0.4)] body-light:drop-shadow-none ${deviceMode === 'mobile' ? 'text-xl' : 'text-4xl'}`}
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
                      className={`font-serif leading-relaxed text-white body-light:text-slate-900 text-center italic ${deviceMode === 'mobile' ? 'text-md max-w-[80%]' : 'text-2xl'}`}
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
              <div className="p-12 rounded-[40px] bg-white/[0.02] body-light:bg-slate-100 border border-white/5 body-light:border-slate-200 relative group">
                <div className="absolute inset-0 bg-brand-primary/10 blur-[100px] opacity-20 group-hover:opacity-40 transition-opacity" />
                <Headphones size={120} className="text-white body-light:text-slate-300 opacity-20 relative z-10" />
                
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
        <div className="h-[4px] w-full bg-white/5 body-light:bg-slate-200 rounded-full relative mb-4">
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
          className="text-slate-400 body-light:text-slate-500 hover:text-white body-light:hover:text-slate-900 transition-colors p-2"
        >
          <SkipBack size={deviceMode === 'mobile' ? 24 : 26} />
        </button>
        <button 
          onClick={togglePlay}
          className={`rounded-full bg-white body-light:bg-slate-900 text-black body-light:text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl ${deviceMode === 'mobile' ? 'w-20 h-20' : 'w-[72px] h-[72px]'}`}
        >
          {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
        </button>
        <button 
          onClick={() => skipRelative(1)}
          className="text-slate-400 body-light:text-slate-500 hover:text-white body-light:hover:text-slate-900 transition-colors p-2"
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
               className="absolute bottom-full right-0 mb-4 w-56 glass border border-white/10 body-light:border-slate-200 rounded-2xl p-2 shadow-2xl overflow-hidden"
            >
              {[
                { id: 'UK-F', label: 'a) British Female' },
                { id: 'UK-M', label: 'b) British Male' }
              ].map((v) => (
                <button 
                  key={v.id}
                  onClick={() => {
                    onVoiceSelect(v.id as any);
                    setShowVoiceMenu(false);
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${voiceType === v.id ? 'bg-brand-primary text-white' : 'hover:bg-white/5 body-light:hover:bg-slate-50 text-slate-400 body-light:text-slate-600 font-medium'}`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${voiceType === v.id ? 'bg-white shadow-[0_0_8px_white]' : 'bg-slate-700 body-light:bg-slate-300'}`} />
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
          className={`flex items-center justify-center gap-3 px-6 py-3 rounded-full glass border border-white/10 body-light:border-slate-200 text-xs text-slate-300 body-light:text-slate-900 hover:text-white body-light:hover:bg-slate-50 transition-all group mx-auto mb-4 w-full h-12 shadow-xl shrink-0`}
        >
          <div className="w-2.5 h-2.5 rounded-full bg-brand-accent shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <span className="font-medium whitespace-nowrap">Voice: {
            voiceType === 'UK-F' ? 'British Female' : 'British Male'
          }</span>
          <motion.div animate={{ rotate: showVoiceMenu ? 180 : 0 }}>
            <ChevronDown size={14} className="ml-auto" />
          </motion.div>
        </button>
      </div>
    </div>
  );
};
