import React, { useState, useEffect, useMemo } from 'react';
import { Student, Progress, RecitationAchievement, MemorizationAchievement } from './types';
import Dashboard from './components/Dashboard';
import StudentDetailPage from './components/StudentDetailPage';
import StudentProgressPage from './components/StudentProgressPage';
// FIX: Import 'calculateVersesAndPages' from dataService to resolve reference errors.
import { getStudents, saveStudents, getTajweedRules, saveTajweedRules, calculateVersesAndPages } from './services/dataService';
import { QURAN_METADATA, POINTS_PER_WORD } from './constants';
import { useI18n } from './context/I18nProvider';
import Footer from './components/Footer';
import Logo from './components/Logo';
import AddStudentModal from './components/AddStudentModal';
import { useAuth } from './context/AuthProvider';
import LoginPage from './components/LoginPage';
import StudentViewOnlyPage from './components/StudentViewOnlyPage';
import MistakesReviewPage from './components/MistakesReviewPage';

const useTheme = () => {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'system');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const root = document.documentElement;

    const applyTheme = () => {
      const isDark = theme === 'dark' || (theme === 'system' && mediaQuery.matches);
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();
    localStorage.setItem('theme', theme);
    
    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [theme]);

  const currentTheme = useMemo(() => {
    if (theme !== 'system') return theme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  };

  return { currentTheme, toggleTheme };
};

const App: React.FC = () => {
  const { currentUser, loading, logout } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [sessionStudentId, setSessionStudentId] = useState<string | null>(null);
  const [tajweedRules, setTajweedRules] = useState<string[]>([]);
  const { currentTheme, toggleTheme } = useTheme();
  const { t } = useI18n();
  
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [currentStudentView, setCurrentStudentView] = useState<'details' | 'mistakes'>('details');


  // State for live session tracking
  const [progress, setProgress] = useState<{[key: string]: Progress}>({});

  useEffect(() => {
    if (currentUser?.role === 'teacher') {
      setStudents(getStudents(currentUser.id));
      setTajweedRules(getTajweedRules(currentUser.id));
    } else {
      setStudents([]);
      setTajweedRules([]);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.role === 'teacher') {
      saveStudents(currentUser.id, students);
    }
  }, [students, currentUser]);
  
  // Initialize progress from recitation achievements
  useEffect(() => {
    const initialProgress: {[key: string]: Progress} = {};
    students.forEach(student => {
      if (student.recitationAchievements.length > 0) {
        const lastAchievement = [...student.recitationAchievements].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        initialProgress[student.id] = { surah: lastAchievement.endSurah, ayah: lastAchievement.endAyah };
      }
    });
    setProgress(initialProgress);
  }, [students]);

  const handleSaveTajweedRules = (updatedRules: string[]) => {
    if (currentUser?.role !== 'teacher') return;
    setTajweedRules(updatedRules);
    saveTajweedRules(currentUser.id, updatedRules);
  }

  const handleAddStudent = (student: Omit<Student, 'id' | 'mistakes'>) => {
    const newStudent: Student = {
      id: `student-${Date.now()}`,
      name: student.name,
      dob: student.dob,
      recitationAchievements: student.recitationAchievements || [],
      memorizationAchievements: [],
      attendance: student.attendance || [],
      masteredTajweedRules: student.masteredTajweedRules || [],
      tafsirReviews: student.tafsirReviews || [],
      tafsirMemorizationReviews: [],
      mistakes: {},
    };
    setStudents(prevStudents => [...prevStudents, newStudent]);
    setIsAddStudentModalOpen(false); // Close modal after adding
  };

  const handleUpdateStudent = (updatedStudent: Student) => {
    setStudents(prevStudents =>
      prevStudents.map((s) =>
        s.id === updatedStudent.id ? updatedStudent : s
      )
    );
  };
  
  const handleDeleteStudent = (studentId: string) => {
    setStudents(prevStudents => prevStudents.filter(s => s.id !== studentId));
    setSelectedStudentId(null);
    setSessionStudentId(null);
  }

  const handleUpdateProgress = async (studentId: string, surah: number, ayah: number) => {
    setProgress(prev => ({ ...prev, [studentId]: { surah, ayah } }));
    // Also add a recitation achievement to persist this progress
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    let points = 0;
    try {
        const response = await fetch(`https://api.quran.com/api/v4/verses/by_key/${surah}:${ayah}?fields=text_uthmani`);
        if (response.ok) {
            const data = await response.json();
            const text = data.verse?.text_uthmani || '';
            const words = text.split(' ').length;
            points = words * POINTS_PER_WORD;
        }
    } catch(e) {
        console.error("Could not fetch verse for points calculation", e);
        const avgWords = 15;
        points = avgWords * POINTS_PER_WORD;
    }

    const newAchievement: RecitationAchievement = {
      id: `rec-live-${Date.now()}`,
      date: new Date().toISOString(),
      startSurah: surah,
      startAyah: ayah,
      endSurah: surah,
      endAyah: ayah,
      readingQuality: 8, // Default quality for live tracking
      tajweedQuality: 8,
      pagesCompleted: 0,
      versesCompleted: 1,
      pointsEarned: points,
    };
    const updatedStudent = {
      ...student,
      recitationAchievements: [...student.recitationAchievements, newAchievement],
    };
    handleUpdateStudent(updatedStudent);
  };

  const handleCycleMistakeLevel = (studentId: string, surah: number, ayah: number, wordIndex: number) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const key = `${surah}:${ayah}:${wordIndex}`;
    const studentMistakes = student.mistakes || {};
    const currentLevel = studentMistakes[key]?.level || 0;
    const nextLevel = (currentLevel + 1) % 6;

    const newStudentMistakes = { ...studentMistakes };
    if (nextLevel === 0) {
      delete newStudentMistakes[key];
    } else {
      newStudentMistakes[key] = { level: nextLevel, date: new Date().toISOString() };
    }

    const updatedStudent = { ...student, mistakes: newStudentMistakes };
    handleUpdateStudent(updatedStudent);
  };
  
  const handleClearMistake = (studentId: string, surah: number, ayah: number, wordIndex: number) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const key = `${surah}:${ayah}:${wordIndex}`;
    const studentMistakes = student.mistakes || {};
    if (!studentMistakes[key]) return;

    const newStudentMistakes = { ...studentMistakes };
    delete newStudentMistakes[key];

    const updatedStudent = { ...student, mistakes: newStudentMistakes };
    handleUpdateStudent(updatedStudent);
  };

  const handleLogRecitationRange = (studentId: string, range: { start: Progress; end: Progress }) => {
    // This is a simplified async wrapper because the original function was not async
    // but the underlying call should ideally be.
    (async () => {
        const student = students.find(s => s.id === studentId);
        if (!student) return;

        // Note: `getVersesInRange` is async but not awaited here, which could lead to race conditions.
        // For simplicity of this change, we'll keep the structure but ideally this should be refactored.
        const { verses, pages } = calculateVersesAndPages(range.start.surah, range.start.ayah, range.end.surah, range.end.ayah);
        const avgWordsPerVerse = 15;
        const points = verses * avgWordsPerVerse * POINTS_PER_WORD;

        const newAchievement: RecitationAchievement = {
          id: `rec-live-${Date.now()}`,
          date: new Date().toISOString(),
          startSurah: range.start.surah,
          startAyah: range.start.ayah,
          endSurah: range.end.surah,
          endAyah: range.end.ayah,
          readingQuality: 8,
          tajweedQuality: 8,
          pagesCompleted: pages,
          versesCompleted: verses,
          pointsEarned: points,
        };

        const updatedStudent = {
          ...student,
          recitationAchievements: [...student.recitationAchievements, newAchievement],
        };
        handleUpdateStudent(updatedStudent);
    })();
  };
  
  const handleRemoveRecitationAchievement = (studentId: string, achievementId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const updatedStudent = {
      ...student,
      recitationAchievements: student.recitationAchievements.filter(ach => ach.id !== achievementId),
    };
    handleUpdateStudent(updatedStudent);
  };
  
  const handleLogMemorizationRange = (studentId: string, range: { start: Progress; end: Progress }) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const { verses, pages } = calculateVersesAndPages(range.start.surah, range.start.ayah, range.end.surah, range.end.ayah);

    const newAchievement: MemorizationAchievement = {
      id: `mem-live-${Date.now()}`,
      date: new Date().toISOString(),
      startSurah: range.start.surah,
      startAyah: range.start.ayah,
      endSurah: range.end.surah,
      endAyah: range.end.ayah,
      memorizationQuality: 9, // Default quality for live tracking
      pagesCompleted: pages,
      versesCompleted: verses,
    };

    const updatedStudent = {
      ...student,
      memorizationAchievements: [...student.memorizationAchievements, newAchievement],
    };
    handleUpdateStudent(updatedStudent);
  };

  const handleRemoveMemorizationAchievement = (studentId: string, achievementId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const updatedStudent = {
      ...student,
      memorizationAchievements: student.memorizationAchievements.filter(ach => ach.id !== achievementId),
    };
    handleUpdateStudent(updatedStudent);
  };

  const handleBack = () => {
    if (sessionStudentId) {
      setSessionStudentId(null);
    } else if (currentStudentView === 'mistakes') {
      setCurrentStudentView('details');
    } else if (selectedStudentId) {
      setSelectedStudentId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-100 dark:bg-gray-900">
        <Logo />
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }
  
  // Student View-Only Page
  if (currentUser.role === 'student') {
    const allStudentsForTeacher = getStudents(currentUser.teacherId);
    const tajweedRulesForTeacher = getTajweedRules(currentUser.teacherId);

    return (
       <div className="bg-slate-100 dark:bg-gray-900 min-h-screen font-sans text-slate-800 dark:text-slate-200 transition-colors duration-300 flex flex-col">
          <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-40 no-print">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center gap-4">
                <Logo />
                <div className="flex items-center gap-4">
                    <span className="font-semibold text-slate-700 dark:text-slate-200 hidden sm:block">{currentUser.student.name}</span>
                    <button onClick={toggleTheme} aria-label="Toggle theme" className="p-2.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors">
                        {currentTheme === 'dark' ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25c0 5.385 4.365 9.75 9.75 9.75 2.572 0 4.921-.994 6.697-2.648Z" /></svg>}
                    </button>
                    <button onClick={logout} className="px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center gap-2 rounded-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
                        <span className="hidden sm:inline">{t('userMenu.logout')}</span>
                    </button>
                </div>
            </div>
          </header>
          <main className="container mx-auto p-4 sm:p-6 lg:p-8 flex-grow">
              <StudentViewOnlyPage 
                student={currentUser.student}
                students={allStudentsForTeacher}
                quranMetadata={QURAN_METADATA}
                tajweedRules={tajweedRulesForTeacher}
              />
          </main>
          <div className="no-print">
            <Footer />
          </div>
      </div>
    );
  }

  // Teacher View
  const selectedStudent = students.find((s) => s.id === selectedStudentId) || null;
  const sessionStudent = students.find((s) => s.id === sessionStudentId) || null;
  const isDetailedView = !!selectedStudentId || !!sessionStudentId;

  return (
    <div className="bg-slate-100 dark:bg-gray-900 min-h-screen font-sans text-slate-800 dark:text-slate-200 transition-colors duration-300 flex flex-col">
      <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-40 no-print">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center gap-4">
            <Logo />
            <div className="flex items-center gap-2">
                {isDetailedView ? (
                    <button
                    onClick={handleBack}
                    className="px-4 py-2 bg-teal-600 dark:bg-orange-600 text-white rounded-lg hover:bg-teal-700 dark:hover:bg-orange-700 transition-colors flex items-center gap-2"
                    >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                    </svg>
                    <span className="hidden sm:inline">{t('header.backToDashboard')}</span>
                    </button>
                ) : (
                    <button
                        onClick={() => setIsAddStudentModalOpen(true)}
                        className="px-4 py-2.5 bg-teal-600 dark:bg-orange-600 text-white font-semibold rounded-lg shadow-sm hover:bg-teal-700 dark:hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 dark:focus:ring-orange-500 transition-all flex items-center justify-center gap-2"
                        >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        <span className="hidden sm:inline">{t('dashboard.addStudent')}</span>
                    </button>
                )}
                <button onClick={toggleTheme} aria-label="Toggle theme" className="p-2.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors">
                {currentTheme === 'dark' ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25c0 5.385 4.365 9.75 9.75 9.75 2.572 0 4.921-.994 6.697-2.648Z" /></svg>
                )}
                </button>
                <div className="relative">
                    <button onClick={() => setIsUserMenuOpen(o => !o)} className="flex items-center gap-2 p-1.5 rounded-full bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors">
                        <span className="w-7 h-7 bg-teal-200 dark:bg-orange-800 text-teal-700 dark:text-orange-300 rounded-full flex items-center justify-center font-bold text-sm">{currentUser.name.charAt(0).toUpperCase()}</span>
                        <span className="hidden sm:inline text-sm font-semibold text-slate-700 dark:text-slate-200 pe-2">{currentUser.name}</span>
                    </button>
                    {isUserMenuOpen && (
                        <div className="absolute end-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                            <div className="py-1">
                                <button onClick={logout} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center gap-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
                                    {t('userMenu.logout')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      </header>
      <main className="container mx-auto p-4 sm:p-6 lg:p-8 flex-grow">
        {sessionStudent ? (
          <StudentProgressPage
            student={sessionStudent}
            students={students}
            studentProgress={progress[sessionStudent.id]}
            studentMistakes={sessionStudent.mistakes || {}}
            recitationAchievements={sessionStudent.recitationAchievements || []}
            memorizationAchievements={sessionStudent.memorizationAchievements || []}
            onUpdateProgress={handleUpdateProgress}
            onCycleMistakeLevel={handleCycleMistakeLevel}
            onClearMistake={handleClearMistake}
            onLogRecitationRange={handleLogRecitationRange}
            onRemoveRecitationAchievement={handleRemoveRecitationAchievement}
            onLogMemorizationRange={handleLogMemorizationRange}
            onRemoveMemorizationAchievement={handleRemoveMemorizationAchievement}
            onGoBack={() => setSessionStudentId(null)}
          />
        ) : selectedStudent ? (
          currentStudentView === 'mistakes' ? (
            <MistakesReviewPage student={selectedStudent} />
          ) : (
            <StudentDetailPage 
              student={selectedStudent} 
              students={students}
              onUpdateStudent={handleUpdateStudent}
              onDeleteStudent={handleDeleteStudent}
              onStartSession={setSessionStudentId}
              quranMetadata={QURAN_METADATA}
              tajweedRules={tajweedRules}
              onUpdateTajweedRules={handleSaveTajweedRules}
              onReviewMistakes={() => setCurrentStudentView('mistakes')}
            />
          )
        ) : (
          <Dashboard
            students={students}
            onSelectStudent={(id) => { setSelectedStudentId(id); setCurrentStudentView('details'); }}
            quranMetadata={QURAN_METADATA}
          />
        )}
      </main>

      <AddStudentModal 
        isOpen={isAddStudentModalOpen} 
        onClose={() => setIsAddStudentModalOpen(false)}
        onAddStudent={(name, dob) => handleAddStudent({ name, dob, recitationAchievements: [], memorizationAchievements: [], attendance: [], masteredTajweedRules: [], tafsirReviews: [], tafsirMemorizationReviews: [] })}
      />
      
      <div className="no-print">
        <Footer />
      </div>
    </div>
  );
};

export default App;