import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { QURAN_METADATA } from '../constants';
import { RecitationAchievement, QuranVerse, Student, Progress, MemorizationAchievement, Mistake } from '../types';
import MilestoneTracker from './MilestoneTracker';
import ExportReportModal from './ExportReportModal';
import { useI18n } from '../context/I18nProvider';
import { getPageOfAyah } from '../services/dataService';
import ConfirmationModal from './ConfirmationModal';
import ModernToggle from './ModernToggle';

declare var confetti: any;

type LoggingMode = 'reading' | 'memorization';
interface TapState {
  stage: 1 | 2;
  count: number;
}


interface StudentProgressPageProps {
  student: Student;
  students: Student[];
  studentProgress?: Progress;
  studentMistakes: { [key: string]: Mistake };
  recitationAchievements: RecitationAchievement[];
  memorizationAchievements: MemorizationAchievement[];
  onUpdateProgress: (studentId: string, surah: number, ayah: number) => void;
  onCycleMistakeLevel: (studentId: string, surah: number, ayah: number, wordIndex: number) => void;
  onClearMistake: (studentId: string, surah: number, ayah: number, wordIndex: number) => void;
  onLogRecitationRange: (studentId: string, range: { start: Progress, end: Progress }) => void;
  onRemoveRecitationAchievement: (studentId: string, achievementId: string) => void;
  onLogMemorizationRange: (studentId: string, range: { start: Progress, end: Progress }) => void;
  onRemoveMemorizationAchievement: (studentId: string, achievementId: string) => void;
  onGoBack: () => void;
}

const getAge = (dob: string) => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
};

const SearchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
    </svg>
);

const SpinnerIcon = () => (
    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);


const QALQALAH_LETTERS = ['ق', 'ط', 'ب', 'ج', 'د'];
const IKHFA_LETTERS = ['ص', 'ذ', 'ث', 'ك', 'ج', 'ش', 'ق', 'س', 'د', 'ط', 'ز', 'ف', 'ت', 'ض', 'ظ'];
const IDGHAM_LETTERS = ['ي', 'ر', 'م', 'ل', 'و', 'ن'];
const IQLAB_LETTER = 'ب';
const TANWEEN_CHARS = ['ً', 'ٍ', 'ٌ'];
const SUKUN = 'ۡ'; // U+06E1 - Quranic Sukun
const MADDAH = '\u0653'; // ARABIC MADDAH ABOVE

const isArabicLetter = (char: string | undefined): boolean => {
    if (!char) return false;
    const code = char.charCodeAt(0);
    // Range for Arabic letters
    return code >= 0x0621 && code <= 0x064A;
};

const parseWordIntoUnits = (word: string): string[] => {
    const units: string[] = [];
    if (!word) return units;
    let currentUnit = '';
    for (const char of word) {
        if (isArabicLetter(char)) {
            if (currentUnit) {
                units.push(currentUnit);
            }
            currentUnit = char;
        } else {
            currentUnit += char;
        }
    }
    if (currentUnit) {
        units.push(currentUnit);
    }
    return units;
};


const TajweedWord: React.FC<{
    word: string;
    nextWord: string;
    isLastWordInVerse: boolean;
    showQalqalah: boolean;
    showGhunnah: boolean;
    showMadd: boolean;
}> = React.memo(({ word, nextWord, isLastWordInVerse, showQalqalah, showGhunnah, showMadd }) => {
    const units = parseWordIntoUnits(word);

    const getFirstArabicLetter = (w: string): string | null => {
        if (!w) return null;
        for (const char of w) {
            if (isArabicLetter(char)) return char;
        }
        return null;
    };

    const renderedUnits = units.map((unit, index) => {
        
        // --- MADD RULE ---
        if (showMadd && unit.includes(MADDAH)) {
            return <span key={index} className="text-pink-600">{unit}</span>;
        }

        let ghunnahRuleApplied = false;

        // --- GHUNNAH RULES ---
        if (showGhunnah) {
            // 1. Noon/Meem Mushaddad
            if (unit.startsWith('نّ') || unit.startsWith('مّ')) {
                 ghunnahRuleApplied = true;
            }
            
            // 2. Noon Sakinah / Tanween Rules
            if (!ghunnahRuleApplied) {
                const hasNoonSakinah = unit.startsWith('ن' + SUKUN) || (unit.startsWith('ن') && unit.length === 1);
                const hasTanween = TANWEEN_CHARS.some(t => unit.includes(t));

                if (hasNoonSakinah || hasTanween) {
                    let nextLetter: string | null = null;
                    const nextUnit = units[index + 1];

                    // Determine if we need to look at the next word
                    const isEndOfWord = index === units.length - 1;
                    const isFollowedBySilentAlif = hasTanween && unit.includes('ً') && nextUnit && nextUnit.startsWith('ا') && nextUnit.length === 1 && index === units.length - 2;

                    if (isEndOfWord || isFollowedBySilentAlif) {
                        nextLetter = getFirstArabicLetter(nextWord);
                    } else if (nextUnit) {
                        nextLetter = getFirstArabicLetter(nextUnit);
                    }

                    if (nextLetter) {
                        if (IDGHAM_LETTERS.includes(nextLetter) || IKHFA_LETTERS.includes(nextLetter) || nextLetter === IQLAB_LETTER) {
                            ghunnahRuleApplied = true;
                        }
                    }
                }
            }

            // 3. Meem Sakinah Rules
            if (!ghunnahRuleApplied) {
                 const hasMeemSakinah = unit.startsWith('م' + SUKUN) || (unit.startsWith('م') && unit.length === 1);
                 if (hasMeemSakinah) {
                    let nextLetter: string | null = null;
                    const nextUnit = units[index + 1];

                    if (index === units.length - 1) { // is last unit
                        nextLetter = getFirstArabicLetter(nextWord);
                    } else if (nextUnit) {
                        nextLetter = getFirstArabicLetter(nextUnit);
                    }

                    if (nextLetter && (nextLetter === 'ب' || nextLetter === 'م')) {
                        ghunnahRuleApplied = true;
                    }
                 }
            }
        }

        if (ghunnahRuleApplied) {
            return <span key={index} className="text-green-600">{unit}</span>;
        }

        // --- QALQALAH RULE ---
        if (showQalqalah) {
             const baseLetter = unit[0];
             if (QALQALAH_LETTERS.includes(baseLetter)) {
                 const hasSukun = unit.includes(SUKUN);
                 // Is this unit the last *letter* of the word?
                 let isLastLetterOfWord = true;
                 for (let i = index + 1; i < units.length; i++) {
                     if (getFirstArabicLetter(units[i])) {
                         isLastLetterOfWord = false;
                         break;
                     }
                 }
                 
                 if (hasSukun || (isLastWordInVerse && isLastLetterOfWord)) {
                     return <span key={index} className="text-blue-600">{unit}</span>;
                 }
             }
        }
        
        return <span key={index}>{unit}</span>;
    });

    return <>{renderedUnits}</>;
});


type SurahStatus = {
    id: number;
    name: string; // The Arabic name
    transliteratedName: string;
    englishName: string;
    status: 'completed' | 'in-progress' | 'not-started';
};

const SurahProgressBar: React.FC<{ surahStatuses: SurahStatus[], title: string, type: LoggingMode }> = ({ surahStatuses, title, type }) => {
    const colors = {
        reading: {
            completed: 'bg-teal-400',
            inProgress: 'bg-amber-400',
            notStarted: 'bg-slate-200 hover:bg-slate-300'
        },
        memorization: {
            completed: 'bg-sky-400',
            inProgress: 'bg-indigo-400',
            notStarted: 'bg-slate-200 hover:bg-slate-300'
        }
    };

    return (
        <div className="mt-4">
            <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">{title}</h4>
            <div className="flex flex-wrap gap-1">
                {surahStatuses.map(({ id, transliteratedName, status }) => {
                    const statusClass = {
                        'completed': colors[type].completed,
                        'in-progress': colors[type].inProgress,
                        'not-started': colors[type].notStarted
                    }[status];
                    return (
                        <div key={id} className="relative group flex-grow" style={{ minWidth: '0.5%' }}>
                            <div
                                className={`h-4 rounded-sm w-full ${statusClass} transition-colors`}
                            />
                            <div className="absolute bottom-full mb-2 w-max px-2 py-1 bg-gray-800 dark:bg-black text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20 left-1/2 -translate-x-1/2">
                                {transliteratedName}
                                <svg className="absolute text-gray-800 dark:text-black h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255">
                                    <polygon className="fill-current" points="0,0 127.5,127.5 255,0"/>
                                </svg>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const SearchResultsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    results: any[];
    query: string;
    onSelect: (verseKey: string) => void;
}> = ({ isOpen, onClose, results, query, onSelect }) => {
    const { t } = useI18n();
    if (!isOpen) return null;

    const highlightText = (text: string, query: string) => {
        if (!query) return text;
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        return text.split(regex).map((part, index) => 
            regex.test(part) 
                ? <strong key={index} className="bg-yellow-200 dark:bg-yellow-500/50 dark:text-yellow-200 rounded px-1">{part}</strong> 
                : part
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                        {t('liveSession.searchResultsTitle', { query })}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-300 dark:hover:text-white text-2xl">&times;</button>
                </div>
                <div className="flex-grow overflow-y-auto space-y-2 pr-2">
                    {results.map((result) => (
                        <div 
                            key={result.verse_key} 
                            onClick={() => onSelect(result.verse_key)}
                            className="p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 cursor-pointer border dark:border-gray-700"
                        >
                            <p className="font-bold text-teal-600 dark:text-orange-500 mb-1">Surah {result.verse_key.replace(':', ', Ayah ')}</p>
                            <p className="font-quranic text-xl" dir="rtl">
                                {highlightText(result.text, query)}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};


const StudentProgressPage: React.FC<StudentProgressPageProps> = ({ student, students, studentProgress, studentMistakes, recitationAchievements, memorizationAchievements, onUpdateProgress, onCycleMistakeLevel, onClearMistake, onLogRecitationRange, onRemoveRecitationAchievement, onLogMemorizationRange, onRemoveMemorizationAchievement, onGoBack }) => {
    const [loggingMode, setLoggingMode] = useState<LoggingMode>('reading');
    const [selectedSurahId, setSelectedSurahId] = useState<number>(studentProgress?.surah || 1);
    const [verses, setVerses] = useState<QuranVerse[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState('');
    const [scrollToVerseKey, setScrollToVerseKey] = useState<string | null>(studentProgress ? `${studentProgress.surah}:${studentProgress.ayah}` : null);
    const [fontSize, setFontSize] = useState(5); 
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [showTranslation, setShowTranslation] = useState(false);
    const [showQalqalah, setShowQalqalah] = useState(false);
    const [showGhunnah, setShowGhunnah] = useState(false);
    const [showMadd, setShowMadd] = useState(false);
    const [translations, setTranslations] = useState<Record<string, string>>({});
    const [isTranslationLoading, setIsTranslationLoading] = useState(false);
    const [translationError, setTranslationError] = useState<string | null>(null);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isAutoScrolling, setIsAutoScrolling] = useState(false);
    const [scrollSpeed, setScrollSpeed] = useState(50); // Default speed 1-100
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearchResultsModalOpen, setIsSearchResultsModalOpen] = useState(false);
    const [selectionStart, setSelectionStart] = useState<Progress | null>(null);
    const [confirmModalState, setConfirmModalState] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

    const [memorizationTaps, setMemorizationTaps] = useState<Record<string, TapState>>({}); // key: "surah:ayah"
    const [animatingVerse, setAnimatingVerse] = useState<string | null>(null);

    const [hiddenRanges, setHiddenRanges] = useState<{ start: Progress; end: Progress }[]>([]);
    const [longPressStart, setLongPressStart] = useState<Progress | null>(null);

    const longPressTimer = useRef<number | null>(null);
    const longPressFired = useRef(false);
    const prevSurahStatusesRef = useRef<SurahStatus[]>();
    const prevLoggingModeRef = useRef<LoggingMode>();
    const scrollIntervalRef = useRef<number | null>(null);
    const wordPressTimer = useRef<number | null>(null);
    const wordLongPressFired = useRef(false);
    const { t } = useI18n();

    const handleIncreaseSpeed = () => setScrollSpeed(prev => Math.min(100, prev + 5));
    const handleDecreaseSpeed = () => setScrollSpeed(prev => Math.max(1, prev - 5));

    useEffect(() => {
        const handleManualInteraction = () => { if (isAutoScrolling) setIsAutoScrolling(false); };
        if (isAutoScrolling) {
            const intervalDelay = 155 - (scrollSpeed * 1.5);
            scrollIntervalRef.current = window.setInterval(() => {
                if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) setIsAutoScrolling(false);
                else window.scrollBy(0, 1);
            }, intervalDelay);
            window.addEventListener('wheel', handleManualInteraction);
            window.addEventListener('touchmove', handleManualInteraction);
        } else if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
        return () => {
            if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
            window.removeEventListener('wheel', handleManualInteraction);
            window.removeEventListener('touchmove', handleManualInteraction);
        };
    }, [isAutoScrolling, scrollSpeed]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code === 'Space') {
                const target = event.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
                event.preventDefault();
                setIsAutoScrolling(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const surahStatuses = useMemo<SurahStatus[]>(() => {
        const achievements = loggingMode === 'reading' ? recitationAchievements : memorizationAchievements;
        return QURAN_METADATA.map(surah => {
            const surahId = surah.number;
            let status: 'completed' | 'in-progress' | 'not-started' = 'not-started';

            for (const range of achievements) {
                if (surahId > range.startSurah && surahId < range.endSurah) {
                    status = 'completed'; break;
                }
                if (surahId === range.startSurah || surahId === range.endSurah) {
                    if (range.startSurah === surahId && range.endSurah === surahId && range.startAyah === 1 && range.endAyah === surah.numberOfAyahs) {
                         status = 'completed'; break;
                    } else {
                         status = 'in-progress';
                    }
                }
            }
            return {
                id: surah.number, name: surah.name, transliteratedName: surah.transliteratedName,
                englishName: surah.englishName, status
            };
        });
    }, [recitationAchievements, memorizationAchievements, loggingMode]);

    const getSurahNavButtonClass = (surahId: number, status: SurahStatus['status']) => {
        if (surahId === selectedSurahId) return 'bg-teal-600 dark:bg-orange-600 text-white shadow-lg transform scale-105';
        
        const modeColors = {
            reading: { completed: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300 hover:bg-teal-200 dark:hover:bg-teal-900',
                       inProgress: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900' },
            memorization: { completed: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900',
                            inProgress: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900' }
        };
        const defaultClass = 'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-600';
        
        switch (status) {
            case 'completed': return modeColors[loggingMode].completed;
            case 'in-progress': return modeColors[loggingMode].inProgress;
            default: return defaultClass;
        }
    };

    const getDividerClass = (surahId: number, status: SurahStatus['status']) => {
        if (surahId === selectedSurahId) return 'bg-white/40 dark:bg-white/40';
        const modeColors = {
            reading: { completed: 'bg-teal-300 dark:bg-teal-700', inProgress: 'bg-amber-300 dark:bg-amber-700' },
            memorization: { completed: 'bg-sky-300 dark:bg-sky-700', inProgress: 'bg-indigo-300 dark:bg-indigo-700' }
        };
        switch (status) {
            case 'completed': return modeColors[loggingMode].completed;
            case 'in-progress': return modeColors[loggingMode].inProgress;
            default: return 'bg-slate-300 dark:bg-gray-600';
        }
    };

    const toEasternArabicNumerals = (num: number): string => {
        const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
        return String(num).split('').map(digit => arabicNumerals[parseInt(digit, 10)]).join('');
    };

    useEffect(() => {
        const fetchSurah = async () => {
            if (!selectedSurahId) return;
            setIsLoading(true); setError(null);
            try {
                const response = await fetch(`https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=${selectedSurahId}`);
                if (!response.ok) throw new Error('Failed to fetch Surah data.');
                const data = await response.json();
                setVerses(data.verses);
            } catch (err: any) {
                setError(err.message); setVerses([]);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSurah();
    }, [selectedSurahId]);

    useEffect(() => {
        const fetchTranslation = async () => {
            if (!selectedSurahId || !showTranslation) { setTranslations({}); return; }
            setIsTranslationLoading(true); setTranslationError(null);
            try {
                const response = await fetch(`https://api.alquran.cloud/v1/surah/${selectedSurahId}/en.sahih`);
                if (!response.ok) throw new Error('Failed to fetch translation data from the network.');
                const data = await response.json();
                if (data.code !== 200 || !data.data || !data.data.ayahs) throw new Error('Invalid or unexpected API response for translation.');
                const translationMap = data.data.ayahs.reduce((acc: Record<string, string>, item: { numberInSurah: number, text: string }) => {
                    acc[`${selectedSurahId}:${item.numberInSurah}`] = item.text; return acc;
                }, {});
                setTranslations(translationMap);
            } catch (err: any) {
                console.error("Failed to fetch Translation", err);
                setTranslationError(t('liveSession.translationError'));
            } finally {
                setIsTranslationLoading(false);
            }
        };
        fetchTranslation();
    }, [selectedSurahId, showTranslation, t]);

    useEffect(() => {
        if (scrollToVerseKey && verses.length > 0) {
            const element = document.getElementById(`verse-container-${scrollToVerseKey}`);
            if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setScrollToVerseKey(null);
        }
    }, [verses, scrollToVerseKey]);
    
    useEffect(() => {
        const surahElement = document.getElementById(`surah-nav-${selectedSurahId}`);
        if (surahElement) surahElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [selectedSurahId]);

    const showToast = useCallback((message: string) => {
        setToastMessage(message);
        setTimeout(() => setToastMessage(null), 3000);
    }, []);

    useEffect(() => {
        if (typeof confetti === 'undefined') {
            const script = document.createElement('script');
            script.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.5.1/dist/confetti.browser.min.js";
            script.async = true; document.body.appendChild(script);
        }
    }, []);

    useEffect(() => {
        // If it's the first run, if the previous statuses aren't stored yet,
        // or if the logging mode has changed, we should not check for newly
        // completed surahs. Instead, we just update our references and wait
        // for the next change (e.g., a new achievement being logged).
        if (typeof confetti === 'undefined' || !prevSurahStatusesRef.current || prevLoggingModeRef.current !== loggingMode) {
            prevSurahStatusesRef.current = surahStatuses;
            prevLoggingModeRef.current = loggingMode;
            return;
        }

        const prevStatuses = prevSurahStatusesRef.current;
        const newlyCompletedSurahs = surahStatuses.filter((current, index) => {
            const prev = prevStatuses[index];
            // Check if the current status is completed and the previous was not.
            return prev && current.status === 'completed' && prev.status !== 'completed';
        });

        if (newlyCompletedSurahs.length > 0) {
            confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 }, zIndex: 1000 });
            const completedNames = newlyCompletedSurahs.map(s => s.englishName).join(', ');
            showToast(t('liveSession.surahCompleted', { name: completedNames }));
        }

        // Always update the refs for the next render.
        prevSurahStatusesRef.current = surahStatuses;
        prevLoggingModeRef.current = loggingMode;
    }, [surahStatuses, loggingMode, showToast, t]);
    
    const handleSurahSelection = (id: number) => setSelectedSurahId(id);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault(); const term = searchInput.trim(); if (!term) return;
        setIsSearchResultsModalOpen(false); setSearchResults([]); setIsSearching(true);
        const lowerCaseTerm = term.toLowerCase();
        const foundSurahByName = QURAN_METADATA.find(s => s.englishName.toLowerCase().includes(lowerCaseTerm) || s.transliteratedName.toLowerCase().replace(/-/g, ' ').includes(lowerCaseTerm.replace(/-/g, ' ')));
        if (foundSurahByName) { setSelectedSurahId(foundSurahByName.number); setIsSearching(false); return; }
        if (term.includes(':')) {
            const [surah, ayah] = term.split(':'); const surahNum = parseInt(surah, 10);
            if (!isNaN(surahNum) && surahNum >= 1 && surahNum <= 114) { if (selectedSurahId !== surahNum) setSelectedSurahId(surahNum); setScrollToVerseKey(term); setIsSearching(false); return; }
        }
        const num = parseInt(lowerCaseTerm.replace('page ', ''), 10);
        if (!isNaN(num)) {
            if (num >= 1 && num <= 114 && !lowerCaseTerm.startsWith('page')) { setSelectedSurahId(num); setIsSearching(false); return; }
            if (lowerCaseTerm.startsWith('page ') || num > 114) {
                try {
                    const response = await fetch(`https://api.quran.com/api/v4/verses/by_page/${num}?fields=text_uthmani`); if (!response.ok) throw new Error('Could not find page.');
                    const data = await response.json();
                    if (data.verses && data.verses.length > 0) {
                        const firstVerseKey = data.verses[0].verse_key; const [surahNum] = firstVerseKey.split(':').map(Number);
                        if (selectedSurahId !== surahNum) setSelectedSurahId(surahNum); setScrollToVerseKey(firstVerseKey);
                    }
                } catch (err) { alert(t('liveSession.pageNotFound')); } finally { setIsSearching(false); } return;
            }
        }
        try {
            const response = await fetch(`https://api.quran.com/api/v4/search?q=${encodeURIComponent(term)}`); if (!response.ok) throw new Error('Search API failed');
            const data = await response.json(); const results = data.search?.results;
            if (results && results.length > 0) {
                if (results.length === 1) {
                    const verseKey = results[0].verse_key; const [surahNum] = verseKey.split(':').map(Number);
                    if (selectedSurahId !== surahNum) setSelectedSurahId(surahNum); setScrollToVerseKey(verseKey);
                } else { setSearchResults(results); setIsSearchResultsModalOpen(true); }
                setIsSearching(false); return;
            }
        } catch (searchError) { console.error("Word search failed:", searchError); }
        alert(t('liveSession.searchNotFound', { query: searchInput })); setIsSearching(false);
    };

    const handleSelectSearchResult = (verseKey: string) => {
        const [surahNum] = verseKey.split(':').map(Number);
        if (selectedSurahId !== surahNum) setSelectedSurahId(surahNum);
        setScrollToVerseKey(verseKey); setIsSearchResultsModalOpen(false); setSearchResults([]);
    };

    const handleIncreaseFontSize = () => setFontSize(prev => Math.min(prev + 1, 8));
    const handleDecreaseFontSize = () => setFontSize(prev => Math.max(prev - 1, 2));

    const selectedSurahInfo = QURAN_METADATA.find(s => s.number === selectedSurahId);
    
    const getMistakeColor = (level: number): string => {
        switch (level) {
            case 1: return 'bg-yellow-200/70'; // 1st click
            case 2: return 'bg-orange-200/70'; // 2nd click
            case 3: return 'bg-red-200/70';    // 3rd click
            case 4: return 'bg-orange-200/70'; // 4th click (correction)
            case 5: return 'bg-yellow-200/70'; // 5th click (correction)
            default: return 'transparent';     // 0 or undefined
        }
    };

    const isVerseAfterOrEqual = (v1: Progress, v2: Progress) => (v1.surah > v2.surah) || (v1.surah === v2.surah && v1.ayah >= v2.ayah);
    
    const getVerseRangeInfo = useCallback((surahNum: number, ayahNum: number, achievements: (RecitationAchievement | MemorizationAchievement)[]) => {
        const currentVerse = { surah: surahNum, ayah: ayahNum };
        for (const ach of achievements) {
            if (isVerseAfterOrEqual(currentVerse, { surah: ach.startSurah, ayah: ach.startAyah }) && isVerseAfterOrEqual({ surah: ach.endSurah, ayah: ach.endAyah }, currentVerse)) {
                return { isLogged: true, achievementId: ach.id };
            }
        }
        return { isLogged: false, achievementId: null };
    }, []);

    const handleVerseTextClick = (surahNum: number, ayahNum: number) => {
        const key = `${surahNum}:${ayahNum}`;
        const currentTapState = memorizationTaps[key] || { stage: 1, count: 0 };
        const newCount = currentTapState.count + 1;

        setAnimatingVerse(key);
        setTimeout(() => setAnimatingVerse(null), 600);
        
        if (currentTapState.stage === 1) {
            if (newCount === 5) {
                setMemorizationTaps(prev => ({ ...prev, [key]: { stage: 2, count: 0 } }));
            } else {
                setMemorizationTaps(prev => ({ ...prev, [key]: { ...currentTapState, count: newCount } }));
            }
        } else {
            if (newCount === 5) {
                onLogMemorizationRange(student.id, { start: { surah: surahNum, ayah: ayahNum }, end: { surah: surahNum, ayah: ayahNum } });
                showToast(t('liveSession.memorizationSaved', { ayah: ayahNum }));
                setMemorizationTaps(prev => { const newState = { ...prev }; delete newState[key]; return newState; });
            } else {
                setMemorizationTaps(prev => ({ ...prev, [key]: { ...currentTapState, count: newCount } }));
            }
        }
    };
    
    const handleVerseClick = (surahNum: number, ayahNum: number) => {
        const achievements = loggingMode === 'reading' ? recitationAchievements : memorizationAchievements;
        const { isLogged, achievementId } = getVerseRangeInfo(surahNum, ayahNum, achievements);

        if (isLogged && achievementId) {
            const ach = achievements.find(a => a.id === achievementId);
            if (ach) {
                const onConfirm = () => {
                    if (loggingMode === 'reading') {
                        onRemoveRecitationAchievement(student.id, achievementId);
                        showToast(t('liveSession.rangeRemoved'));
                    } else {
                        onRemoveMemorizationAchievement(student.id, achievementId);
                        showToast(t('liveSession.memorizationRangeRemoved'));
                    }
                };

                const title = loggingMode === 'reading' ? t('liveSession.removeRangeTitle') : t('liveSession.removeMemorizationRangeTitle');
                const messageKey = loggingMode === 'reading' ? 'liveSession.confirmRemoveRange' : 'liveSession.confirmRemoveMemorizationRange';
                
                setConfirmModalState({
                    isOpen: true,
                    title: title,
                    message: t(messageKey, { 
                        startSurah: QURAN_METADATA.find(s => s.number === ach.startSurah)?.transliteratedName, 
                        startAyah: ach.startAyah,
                        endSurah: QURAN_METADATA.find(s => s.number === ach.endSurah)?.transliteratedName, 
                        endAyah: ach.endAyah
                    }),
                    onConfirm: onConfirm
                });
            }
            return;
        }
    
        const clickedVerse = { surah: surahNum, ayah: ayahNum };
        if (!selectionStart) {
            setSelectionStart(clickedVerse);
        } else {
            if (!isVerseAfterOrEqual(clickedVerse, selectionStart)) {
                showToast(t('liveSession.endVerseError')); setSelectionStart(null); return;
            }
            if (loggingMode === 'reading') {
                onLogRecitationRange(student.id, { start: selectionStart, end: clickedVerse });
                showToast(t('liveSession.rangeSaved'));
            } else {
                onLogMemorizationRange(student.id, { start: selectionStart, end: clickedVerse });
                showToast(t('liveSession.memorizationRangeSaved'));
            }
            setSelectionStart(null);
        }
    };

    const handleVerseNumberPressStart = (surahNum: number, ayahNum: number) => {
        longPressFired.current = false;
        longPressTimer.current = window.setTimeout(() => {
            const currentVerse = { surah: surahNum, ayah: ayahNum };
            
            // Check if this verse is already hidden
            const containingRangeIndex = hiddenRanges.findIndex(range =>
                isVerseAfterOrEqual(currentVerse, range.start) && isVerseAfterOrEqual(range.end, currentVerse)
            );

            if (containingRangeIndex > -1) {
                // If it's in a hidden range, reveal it
                setHiddenRanges(prev => prev.filter((_, index) => index !== containingRangeIndex));
                setLongPressStart(null);
            } else if (!longPressStart) {
                // If no start is set, set this as the start
                setLongPressStart(currentVerse);
            } else {
                // If a start is set, complete the range
                const start = isVerseAfterOrEqual(currentVerse, longPressStart) ? longPressStart : currentVerse;
                const end = isVerseAfterOrEqual(currentVerse, longPressStart) ? currentVerse : longPressStart;
                setHiddenRanges(prev => [...prev, { start, end }]);
                setLongPressStart(null);
            }
            longPressFired.current = true;
        }, 500); // 500ms for long press
    };
    
    const handleVerseNumberPressEnd = (surahNum: number, ayahNum: number) => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
        }
        if (!longPressFired.current) {
            // This is a short click, handle regular range selection
            handleVerseClick(surahNum, ayahNum);
        }
    };
    
    const handleVerseContainerClick = (e: React.MouseEvent<HTMLSpanElement>, surahNum: number, ayahNum: number) => {
        if (wordLongPressFired.current) {
            wordLongPressFired.current = false; // Reset the flag
            return; // Don't proceed if a long press just fired
        }

        // If a long press was just completed, this click on the text should cancel any pending "hiding" action
        // and reset the state so subsequent clicks work as expected.
        if (longPressFired.current) {
            longPressFired.current = false; // Reset the flag
            if (longPressStart) {
                setLongPressStart(null); // Cancel the hiding mode
            }
            return; // Don't proceed with other click actions on this specific click.
        }

        // Also cancel hiding mode if user clicks text while it's active
        if (longPressStart) {
            setLongPressStart(null);
            return;
        }

        if (loggingMode === 'memorization') {
            handleVerseTextClick(surahNum, ayahNum);
        } else if (loggingMode === 'reading') {
            const target = e.target as HTMLElement;
            const wordSpan = target.closest<HTMLSpanElement>('span[data-word-index]');

            if (wordSpan) {
                const wordIndex = parseInt(wordSpan.dataset.wordIndex || '-1', 10);
                if (wordIndex !== -1) {
                    onCycleMistakeLevel(student.id, surahNum, ayahNum, wordIndex);
                }
            }
        }
    };


    const VerseMarker: React.FC<{ number: number; surah: number; isSelectedStart: boolean }> = ({ number, surah, isSelectedStart }) => {
        const verseKey = `${surah}:${number}`;
        const isRead = getVerseRangeInfo(surah, number, recitationAchievements).isLogged;
        const showReadFill = loggingMode === 'reading' && isRead;
        const isMemorized = getVerseRangeInfo(surah, number, memorizationAchievements).isLogged;
        const tapState = memorizationTaps[verseKey];
        const isAnimating = animatingVerse === verseKey;
        const isLongPressStart = longPressStart?.surah === surah && longPressStart?.ayah === number;
        
        const glowClass = isSelectedStart ? 'ring-2 ring-offset-4 ring-teal-500 dark:ring-orange-500 animate-pulse' : '';
        const longPressGlowClass = isLongPressStart ? 'animate-glow' : '';
        const animationClass = isAnimating ? 'animate-tap-glow' : '';

        return (
            <span
                onMouseDown={() => handleVerseNumberPressStart(surah, number)}
                onMouseUp={() => handleVerseNumberPressEnd(surah, number)}
                onTouchStart={() => handleVerseNumberPressStart(surah, number)}
                onTouchEnd={() => handleVerseNumberPressEnd(surah, number)}
                className={`inline-flex items-center justify-center w-12 h-12 mx-2 font-mono text-base font-bold text-slate-700 dark:text-slate-200 cursor-pointer relative transition-all rounded-full ${glowClass} ${longPressGlowClass} ${animationClass}`}
                style={{ verticalAlign: 'middle' }} role="button" aria-label={`Mark progress at verse ${number}`}
            >
                {tapState && (
                    <div className="absolute -top-1 -right-1 bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold z-20">
                        {tapState.count}
                    </div>
                )}
                <svg className="absolute inset-0 w-full h-full text-slate-200 dark:text-gray-700" viewBox="0 0 100 100" fill={ isMemorized ? '#38bdf8' : (showReadFill ? '#a7f3d0' : 'currentColor') }>
                    <path d="M50,4 C24.6,4 4,24.6 4,50 C4,75.4 24.6,96 50,96 C75.4,96 96,75.4 96,50 C96,24.6 75.4,4 50,4 Z M50,10 C72.1,10 90,27.9 90,50 C90,72.1 72.1,90 50,90 C27.9,90 10,72.1 10,50 C10,27.9 27.9,10 50,10 Z" />
                    <path d="M50,16 C49.2,21.8 45.8,25.2 40,26 C34.2,26.8 30.8,30.2 30,36 C29.2,41.8 32.2,45.8 38,48 C43.8,50.2 48.2,53.2 50,60 C51.8,53.2 56.2,50.2 62,48 C67.8,45.8 70.8,41.8 70,36 C69.2,30.2 65.8,26.8 60,26 C54.2,25.2 50.8,21.8 50,16 Z" />
                </svg>
                <span className="relative z-10">{toEasternArabicNumerals(number)}</span>
            </span>
        );
    };

    const PageSeparator: React.FC<{ pageNumber: number }> = ({ pageNumber }) => (
        <div className="w-full my-8 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm font-sans" aria-hidden="true">
            <hr className="w-full border-slate-200 dark:border-gray-600 border-dashed" /><span className="whitespace-nowrap px-4 tracking-wider bg-white dark:bg-gray-800">{t('liveSession.page')} {toEasternArabicNumerals(pageNumber)}</span><hr className="w-full border-slate-200 dark:border-gray-600 border-dashed" />
        </div>
    );

    const renderSurahContent = () => {
        if (isLoading) return <div className="flex justify-center items-center h-full p-12"><p>{t('liveSession.loadingSurah')}</p></div>;
        if (error) return <div className="text-center text-red-500 p-12">{error}</div>;
    
        const surahContent: React.ReactNode[] = []; let currentPage = -1;
    
        verses.forEach((verse, verseIndex) => {
            const [surahNum, ayahNum] = verse.verse_key.split(':').map(Number);
            const versePage = getPageOfAyah(surahNum, ayahNum);
    
            if (verseIndex === 0) currentPage = versePage;
            else if (versePage !== currentPage) { surahContent.push(<PageSeparator key={`page-${currentPage}`} pageNumber={currentPage} />); currentPage = versePage; }
            
            const verseKey = `${surahNum}:${ayahNum}`;
            const tapState = memorizationTaps[verseKey];
            const isRead = getVerseRangeInfo(surahNum, ayahNum, recitationAchievements).isLogged;
            const showReadBg = loggingMode === 'reading' && isRead;
            const isMemorized = getVerseRangeInfo(surahNum, ayahNum, memorizationAchievements).isLogged;
            const isHiddenByTap = tapState?.stage === 2 && tapState.count < 5;
            const isVerseHidden = isHiddenByTap || hiddenRanges.some(range => isVerseAfterOrEqual({ surah: surahNum, ayah: ayahNum }, range.start) && isVerseAfterOrEqual(range.end, { surah: surahNum, ayah: ayahNum }));

            const verseWords = verse.text_uthmani.replace(/\u0652/g, '\u06e1').split(' ').map((word, wordIndex, wordsArray) => {
                const key = `${surahNum}:${ayahNum}:${wordIndex}`;
                const mistakeLevel = studentMistakes[key]?.level || 0;
                
                const handlePressStart = () => {
                    if (mistakeLevel > 0) {
                        wordLongPressFired.current = false;
                        wordPressTimer.current = window.setTimeout(() => {
                            onClearMistake(student.id, surahNum, ayahNum, wordIndex);
                            showToast(t('liveSession.mistakeCleared'));
                            wordLongPressFired.current = true;
                        }, 500);
                    }
                };

                const handlePressEnd = () => {
                    if (wordPressTimer.current) {
                        clearTimeout(wordPressTimer.current);
                    }
                };
                
                return (
                    <React.Fragment key={key}>
                        <span 
                            data-word-index={wordIndex}
                            className={`px-1 rounded-md transition-colors ${getMistakeColor(mistakeLevel)}`}
                            onMouseDown={handlePressStart}
                            onMouseUp={handlePressEnd}
                            onMouseLeave={handlePressEnd}
                            onTouchStart={handlePressStart}
                            onTouchEnd={handlePressEnd}
                        >
                            <TajweedWord word={word} nextWord={wordsArray[wordIndex + 1] || ''} isLastWordInVerse={wordIndex === wordsArray.length - 1} showQalqalah={showQalqalah} showGhunnah={showGhunnah} showMadd={showMadd} />
                        </span>{' '}
                    </React.Fragment>
                );
            });
            const isSelectedStart = selectionStart?.surah === surahNum && selectionStart?.ayah === ayahNum;
            const verseMarker = (<VerseMarker key={`marker-${verse.verse_key}`} number={ayahNum} surah={surahNum} isSelectedStart={isSelectedStart}/>);
            const verseTextNode = (
                <span 
                    key={`text-${verse.verse_key}`} 
                    className={`px-1 py-1 rounded-md transition-opacity duration-300 ${isMemorized ? 'bg-sky-50 dark:bg-sky-900/30' : (showReadBg ? 'bg-teal-50 dark:bg-teal-900/30' : '')} ${isVerseHidden ? 'opacity-0' : 'opacity-100'} ${loggingMode === 'memorization' ? 'cursor-pointer' : ''}`} 
                    onClick={(e) => handleVerseContainerClick(e, surahNum, ayahNum)}
                >
                    {isVerseHidden ? <span className="text-slate-300 dark:text-gray-600">•••• •••• •••••</span> : verseWords}
                </span>
            );

            const verseContainerClass = `my-4${showTranslation ? '' : ' inline'}`;
            const verseContainerId = `verse-container-${verse.verse_key}`;

            if (showTranslation) {
                const verseContainer = (
                    <div id={verseContainerId} key={`verse-container-${verse.verse_key}`} className="my-4">
                        <div className="arabic-verse leading-[2.8]">{verseTextNode}{verseMarker}</div>
                        <div key={`trans-container-${verse.verse_key}`} dir="ltr" className="translation-container mt-4 text-left font-sans text-base leading-relaxed">{isTranslationLoading ? (<div className="p-4 bg-slate-50 dark:bg-gray-700/50 rounded-lg text-slate-500 animate-pulse">{t('liveSession.loadingTranslation')}</div>) : translations[verse.verse_key] ? (<div className="p-4 bg-slate-50 dark:bg-gray-700/50 rounded-lg text-slate-700 dark:text-slate-300"><p className="font-bold text-teal-700 dark:text-orange-500 mb-1">{t('liveSession.translation')}:</p>{translations[verse.verse_key]}</div>) : translationError ? (<div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400">{translationError}</div>) : null}</div>
                    </div>
                );
                surahContent.push(verseContainer);
            } else { 
                surahContent.push(
                    <div id={verseContainerId} key={verseContainerId} className={verseContainerClass}>
                        {verseTextNode}
                        {verseMarker}
                    </div>
                );
             }
        });
        const wrapperClassName = `font-quranic text-slate-900 dark:text-slate-100 text-center text-${fontSize}xl select-none p-6 sm:p-12` + (showTranslation ? '' : ' leading-[2.8]');
        return (<div className={wrapperClassName}>{surahContent}</div>);
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200 dark:bg-gray-800 dark:border-gray-700">
                <div className="flex justify-between items-start">
                    <div className="flex-grow">
                        <h1 className="text-2xl font-bold text-teal-800 dark:text-slate-100">{student.name} ({t('liveSession.age', { age: getAge(student.dob) })})</h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-2">{t('liveSession.currentProgress')}: {studentProgress ? `${QURAN_METADATA[studentProgress.surah - 1].transliteratedName}, Ayah ${studentProgress.ayah}` : t('liveSession.notSet')}</p>
                    </div>
                     <div className="flex-shrink-0 flex items-center gap-2"><button onClick={() => onGoBack()} className="p-2.5 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg></button></div>
                </div>
                {loggingMode === 'reading' 
                    ? <SurahProgressBar surahStatuses={surahStatuses} title={t('liveSession.overallProgress')} type="reading" />
                    : <SurahProgressBar surahStatuses={surahStatuses} title={t('liveSession.memorizationProgress')} type="memorization" />
                }
                <MilestoneTracker studentProgress={studentProgress} />
            </div>

            <div className="space-y-6">
                <div className="p-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-t-none rounded-b-xl shadow-md border border-slate-200 dark:border-gray-700 sticky top-[68px] z-30">
                    <div className="flex items-center gap-4 justify-between">
                        <div className="flex items-center gap-4">
                             <ModernToggle 
                                value={loggingMode} 
                                onChange={setLoggingMode} 
                                labelOne={t('liveSession.reading')} 
                                labelTwo={t('liveSession.memorization')} 
                                orientation="horizontal" 
                            />
                        </div>
                        <div className="flex-grow horizontal-scrollbar overflow-x-auto">
                            <div className="flex items-center gap-2 pb-3">
                                {surahStatuses.map(({ id, transliteratedName, status }) => (<button key={id} id={`surah-nav-${id}`} onClick={() => handleSurahSelection(id)} className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap ${getSurahNavButtonClass(id, status)}`}><span className="font-mono text-xs">{id}</span><div className={`w-px h-4 ${getDividerClass(id, status)}`}></div><span className="tracking-wide">{transliteratedName}</span></button>))}
                            </div>
                        </div>
                        <div className="flex-shrink-0 flex gap-4 items-center">
                            <div className="flex flex-col items-center gap-1">
                                <div className="flex items-center gap-1">
                                    <div className="flex items-center gap-1 bg-slate-200 dark:bg-gray-700 rounded-lg p-1">
                                        <button onClick={handleDecreaseFontSize} className="w-7 h-7 flex items-center justify-center text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-300 dark:hover:bg-gray-600 font-bold transition" aria-label={t('liveSession.decreaseFont')}>-</button>
                                        <span className="text-slate-600 dark:text-slate-300 font-semibold w-7 text-center text-sm">A</span>
                                        <button onClick={handleIncreaseFontSize} className="w-7 h-7 flex items-center justify-center text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-300 dark:hover:bg-gray-600 font-bold transition" aria-label={t('liveSession.increaseFont')}>+</button>
                                    </div>
                                    <div className={`flex items-center gap-2 bg-slate-200 dark:bg-gray-700 rounded-lg p-1 transition-all duration-300 ease-in-out ${isAutoScrolling ? 'w-32 sm:w-40' : 'w-auto'}`}>
                                        <button onClick={() => setIsAutoScrolling(prev => !prev)} className="w-7 h-7 flex items-center justify-center text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-300 dark:hover:bg-gray-600 font-bold transition flex-shrink-0" title={isAutoScrolling ? t('liveSession.toggleAutoScrollPause') : t('liveSession.toggleAutoScrollPlay')}>
                                            {isAutoScrolling ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v10a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5ZM12.5 3.5A1.5 1.5 0 0 1 14 5v10a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5Z" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m9 12.75 3 3m0 0 3-3m-3 3v-7.5" /></svg>}
                                        </button>
                                        {isAutoScrolling && (<div className="flex items-center justify-center gap-1 flex-grow"><button onClick={handleDecreaseSpeed} className="w-7 h-7 flex items-center justify-center text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-300 dark:hover:bg-gray-600 font-bold transition" aria-label={t('liveSession.decreaseScrollSpeed')} title={t('liveSession.decreaseScrollSpeed')}>-</button><span className="text-sm font-mono text-slate-700 dark:text-slate-200 w-8 text-center">{scrollSpeed}</span><button onClick={handleIncreaseSpeed} className="w-7 h-7 flex items-center justify-center text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-300 dark:hover:bg-gray-600 font-bold transition" aria-label={t('liveSession.increaseScrollSpeed')} title={t('liveSession.increaseScrollSpeed')}>+</button></div>)}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setShowTranslation(prev => !prev)} className={`w-8 h-7 flex items-center justify-center rounded-md text-xs font-bold transition-colors duration-200 px-2 ${showTranslation ? 'bg-teal-600 text-white shadow-md' : 'bg-slate-200 text-slate-700 hover:bg-teal-100'}`} aria-pressed={showTranslation} title={t('liveSession.toggleTranslation')}>T</button>
                                    <button onClick={() => setShowQalqalah(prev => !prev)} className={`w-8 h-7 flex items-center justify-center rounded-md text-xs font-bold transition-colors duration-200 px-2 ${showQalqalah ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-200 text-slate-700 hover:bg-blue-100'}`} aria-pressed={showQalqalah} title={t('liveSession.toggleQalqalah')}>Q</button>
                                    <button onClick={() => setShowGhunnah(prev => !prev)} className={`w-8 h-7 flex items-center justify-center rounded-md text-xs font-bold transition-colors duration-200 px-2 ${showGhunnah ? 'bg-green-600 text-white shadow-md' : 'bg-slate-200 text-slate-700 hover:bg-green-100'}`} aria-pressed={showGhunnah} title={t('liveSession.toggleGhunnah')}>G</button>
                                    <button onClick={() => setShowMadd(prev => !prev)} className={`w-8 h-7 flex items-center justify-center rounded-md text-xs font-bold transition-colors duration-200 px-2 ${showMadd ? 'bg-pink-600 text-white shadow-md' : 'bg-slate-200 text-slate-700 hover:bg-pink-100'}`} aria-pressed={showMadd} title={t('liveSession.toggleMadd')}>M</button>
                                </div>
                            </div>
                            <form onSubmit={handleSearch} className="flex gap-2 items-center">
                                <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder={t('liveSession.searchPlaceholder')} className="w-48 px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-white border border-slate-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:focus:ring-orange-500 focus:outline-none transition" />
                                <button type="submit" disabled={isSearching} className="bg-teal-600 dark:bg-orange-600 text-white p-2.5 rounded-lg hover:bg-teal-700 dark:hover:bg-orange-700 transition disabled:bg-slate-400 dark:disabled:bg-gray-600" aria-label={t('liveSession.search')}>
                                    {isSearching ? <SpinnerIcon/> : <SearchIcon/>}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
                <div dir="rtl" className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-slate-200 dark:border-gray-700 min-h-[50vh] overflow-hidden">
                    <div>
                        <div className="text-center pt-12 pb-8 px-6 sm:px-12"><p className="text-4xl font-quranic text-slate-700 dark:text-slate-100">{selectedSurahInfo?.name}</p><p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{selectedSurahInfo?.englishName}</p></div>
                        {showTranslation && isTranslationLoading && <div className="text-center my-4 p-3 bg-slate-100 dark:bg-gray-700 rounded-lg mx-6 sm:mx-12"><p className="text-slate-600 dark:text-slate-300 animate-pulse font-semibold">{t('liveSession.loadingTranslation')}</p></div>}
                        {showTranslation && translationError && <div className="text-center my-4 p-3 bg-red-100 text-red-700 rounded-lg mx-6 sm:mx-12"><p className="font-semibold">{translationError}</p></div>}
                        <hr className="w-48 h-1 mx-auto my-8 bg-teal-100 dark:bg-gray-700 border-0 rounded" />
                        {selectedSurahId !== 1 && selectedSurahId !== 9 && <p className="text-center font-quranic text-4xl text-slate-800 dark:text-slate-200 mb-12">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</p>}
                        {renderSurahContent()}
                    </div>
                </div>
            </div>
            {student && <ExportReportModal student={student} students={students} quranMetadata={QURAN_METADATA} isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} />}
            {toastMessage && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full shadow-lg transition-all animate-bounce z-50">{toastMessage}</div>}
            <SearchResultsModal isOpen={isSearchResultsModalOpen} onClose={() => setIsSearchResultsModalOpen(false)} results={searchResults} query={searchInput} onSelect={handleSelectSearchResult} />
            <ConfirmationModal isOpen={confirmModalState.isOpen} onClose={() => setConfirmModalState({ isOpen: false, title: '', message: '', onConfirm: () => {} })} onConfirm={confirmModalState.onConfirm} title={confirmModalState.title} message={confirmModalState.message} />
        </div>
    );
};

export default StudentProgressPage;