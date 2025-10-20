import { Student, AttendanceStatus, RecitationAchievement, MemorizationAchievement, AttendanceRecord, QuranVerse, Progress, User } from '../types';
import { QURAN_METADATA, POINTS_PER_WORD } from '../constants';
import { pageVerseList } from './quranPageData';

// --- User Management ---
const USERS_KEY = 'quran_progress_tracker_users';
const TEACHER_SESSION_KEY = 'quran_progress_tracker_session_userId';
const STUDENT_SESSION_KEY = 'quran_progress_tracker_session_student';

export const getUsers = (): User[] => {
  const usersJson = localStorage.getItem(USERS_KEY);
  return usersJson ? JSON.parse(usersJson) : [];
};

export const saveUsers = (users: User[]): void => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

export const findUserByEmail = (email: string): User | undefined => {
  const users = getUsers();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase());
};

export const createUser = (name: string, email: string): User => {
  const users = getUsers();
  const newUser: User = { id: `user-${Date.now()}`, name, email, provider: 'email' };
  saveUsers([...users, newUser]);
  return newUser;
};

// New function to find a student by their details across all teachers
export const findStudentByNameAndDob = (firstName: string, lastName: string, dob: string): { student: Student, teacherId: string } | null => {
    const users = getUsers();
    const fullName = `${firstName.trim()} ${lastName.trim()}`.toLowerCase();
    for (const user of users) {
        const students = getStudents(user.id);
        const foundStudent = students.find(s => 
            s.name.toLowerCase() === fullName && s.dob === dob
        );
        if (foundStudent) {
            return { student: foundStudent, teacherId: user.id };
        }
    }
    return null;
};


// --- Session Management ---
export const setCurrentTeacherId = (userId: string): void => {
  localStorage.setItem(TEACHER_SESSION_KEY, userId);
};

export const getCurrentTeacherId = (): string | null => {
  return localStorage.getItem(TEACHER_SESSION_KEY);
};

export const setCurrentStudentSession = (teacherId: string, studentId: string): void => {
  localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify({ teacherId, studentId }));
}

export const getCurrentStudentSession = (): { teacherId: string, studentId: string } | null => {
    const sessionJson = localStorage.getItem(STUDENT_SESSION_KEY);
    return sessionJson ? JSON.parse(sessionJson) : null;
}

export const findUserById = (userId: string): User | undefined => {
  const users = getUsers();
  return users.find(u => u.id === userId);
};

export const clearCurrentSession = (): void => {
  localStorage.removeItem(TEACHER_SESSION_KEY);
  localStorage.removeItem(STUDENT_SESSION_KEY);
};


// --- User-Scoped Data Management ---

interface UserData {
    students: Student[];
    tajweedRules: string[];
}

const getUserDataKey = (userId: string) => `quran_progress_tracker_data_${userId}`;

const getUserData = (userId: string): UserData => {
  const dataJson = localStorage.getItem(getUserDataKey(userId));
  if (dataJson) {
    const data = JSON.parse(dataJson);
    // Backward compatibility: ensure all students have a 'mistakes' property.
    if (data.students && data.students.some((s: Student) => s.mistakes === undefined)) {
        data.students = data.students.map((s: Student) => ({ ...s, mistakes: s.mistakes || {} }));
    }
    return data;
  }
  // Special case for Google Demo user to have mock data
  if (userId === 'google-demo-user') {
      return { students: getInitialMockData(), tajweedRules: getDefaultTajweedRules() };
  }
  // New users start fresh
  return { students: [], tajweedRules: getDefaultTajweedRules() };
}

const saveUserData = (userId: string, data: UserData): void => {
  localStorage.setItem(getUserDataKey(userId), JSON.stringify(data));
}

export const getStudents = (userId: string): Student[] => {
    return getUserData(userId).students;
}

export const saveStudents = (userId: string, students: Student[]): void => {
    const data = getUserData(userId);
    data.students = students;
    saveUserData(userId, data);
}

export const getTajweedRules = (userId: string): string[] => {
    return getUserData(userId).tajweedRules;
}

export const saveTajweedRules = (userId: string, rules: string[]): void => {
    const data = getUserData(userId);
    data.tajweedRules = rules;
    saveUserData(userId, data);
};

// --- Mock Data Generation (for Demo User) ---

const getRandomInt = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

const getNextAyah = (surahNum: number, ayahNum: number): { surah: number, ayah: number } => {
    const surah = QURAN_METADATA.find(s => s.number === surahNum);
    if (!surah) return { surah: 1, ayah: 1 };

    if (ayahNum < surah.numberOfAyahs) {
        return { surah: surahNum, ayah: ayahNum + 1 };
    } else {
        const nextSurahNum = surahNum + 1;
        if (nextSurahNum > 114) {
            return { surah: 114, ayah: QURAN_METADATA[113].numberOfAyahs };
        }
        return { surah: nextSurahNum, ayah: 1 };
    }
};

const getPrevAyah = (surahNum: number, ayahNum: number): { surah: number, ayah: number } => {
    if (ayahNum > 1) {
        return { surah: surahNum, ayah: ayahNum - 1 };
    } else {
        const prevSurahNum = surahNum - 1;
        if (prevSurahNum < 1) return { surah: 1, ayah: 1 }; // Stop at start of Quran
        const prevSurah = QURAN_METADATA.find(s => s.number === prevSurahNum)!;
        return { surah: prevSurahNum, ayah: prevSurah.numberOfAyahs };
    }
};

const AVG_WORDS_PER_VERSE = 15;

const generateStudentHistory = (
    startDate: Date,
    days: number,
    sessionFrequency: number,
    versesPerSession: { min: number, max: number },
    initialSurah: number,
    initialAyah: number
): { recitation: RecitationAchievement[], memorization: MemorizationAchievement[], attendance: AttendanceRecord[] } => {
    const recitation: RecitationAchievement[] = [];
    const memorization: MemorizationAchievement[] = [];
    const attendance: AttendanceRecord[] = [];
    
    let currentRecitationSurah = initialSurah;
    let currentRecitationAyah = initialAyah;

    let currentHifdhSurah = 114;
    let currentHifdhAyah = QURAN_METADATA.find(s => s.number === 114)!.numberOfAyahs + 1;

    for (let i = 0; i < days; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);

        if (Math.random() < 1 / sessionFrequency) {
            const randomStatus = Math.random();
            if (randomStatus < 0.1) {
                attendance.push({ id: `att-${currentDate.getTime()}-${i}`, date: currentDate.toISOString(), status: AttendanceStatus.Absent });
                continue;
            }
            if (randomStatus < 0.2) {
                attendance.push({ id: `att-${currentDate.getTime()}-${i}`, date: currentDate.toISOString(), status: AttendanceStatus.Rescheduled });
                continue;
            }

            attendance.push({ id: `att-${currentDate.getTime()}-${i}`, date: currentDate.toISOString(), status: AttendanceStatus.Present });
            
            if (Math.random() < 0.7) { // Recitation
                if (currentRecitationSurah > 114) continue;
                const versesToRead = getRandomInt(versesPerSession.min, versesPerSession.max);
                let startS = currentRecitationSurah, startA = currentRecitationAyah;
                let endS = startS, endA = startA;
                
                for(let v = 0; v < versesToRead; v++) {
                    if (endS > 114) break;
                    const next = getNextAyah(endS, endA);
                    endS = next.surah; endA = next.ayah;
                }
                
                const { verses, pages } = calculateVersesAndPages(startS, startA, endS, endA);
                const points = verses * AVG_WORDS_PER_VERSE * POINTS_PER_WORD;
                recitation.push({
                    id: `rec-${currentDate.getTime()}-${i}`, date: currentDate.toISOString(),
                    startSurah: startS, startAyah: startA, endSurah: endS, endAyah: endA,
                    readingQuality: getRandomInt(6, 10), tajweedQuality: getRandomInt(5, 10),
                    pagesCompleted: pages, versesCompleted: verses,
                    pointsEarned: points,
                });

                const nextStart = getNextAyah(endS, endA);
                currentRecitationSurah = nextStart.surah; currentRecitationAyah = nextStart.ayah;

            } else { // Memorization
                if (currentHifdhSurah < 1 || (currentHifdhSurah === 1 && currentHifdhAyah <= 1)) continue;
                const versesToMemorize = getRandomInt(1, Math.max(1, versesPerSession.min - 2));
                 
                const { surah: endS, ayah: endA } = getPrevAyah(currentHifdhSurah, currentHifdhAyah);
                let startS = endS, startA = endA;

                for(let v = 0; v < versesToMemorize - 1; v++) {
                    if (startS === 1 && startA === 1) break;
                    const prev = getPrevAyah(startS, startA);
                    startS = prev.surah; startA = prev.ayah;
                }
                 
                const { verses, pages } = calculateVersesAndPages(startS, startA, endS, endA);
                if (verses > 0) {
                    memorization.push({
                        id: `mem-${currentDate.getTime()}-${i}`, date: currentDate.toISOString(),
                        startSurah: startS, startAyah: startA, endSurah: endS, endAyah: endA,
                        memorizationQuality: getRandomInt(7, 10), pagesCompleted: pages, versesCompleted: verses,
                    });
                }
                currentHifdhSurah = startS; currentHifdhAyah = startA;
            }
        }
    }
    return { recitation, memorization, attendance };
};

const getInitialMockData = (): Student[] => {
    const baseStudents = [
        { id: 'student-1', name: 'Aisha Ahmed', dob: '2012-05-15', masteredTajweedRules: ['Izhar', 'Iqlab'], tafsir: [{surah: 1, quality: 8}] },
        { id: 'student-2', name: 'Yusuf Ibrahim', dob: '2005-09-22', masteredTajweedRules: ['Izhar', 'Idgham', 'Iqlab', 'Ikhfa', 'Qalqalah (Sughra & Kubra)', 'Madd (Natural, Muttasil, Munfasil)'], tafsir: [{surah: 112, quality: 9}, {surah: 113, quality: 10}] },
        { id: 'student-3', name: 'Fatima Zahra', dob: '1985-02-10', masteredTajweedRules: ['Rules of Noon Sakinah & Tanween', 'Rules of Meem Sakinah'], tafsir: [] },
        { id: 'student-4', name: 'Khalid Hassan', dob: '2014-01-20', masteredTajweedRules: ['Izhar'], tafsir: [] },
        { id: 'student-5', name: 'Sumaya Ali', dob: '2015-06-01', masteredTajweedRules: ['Iqlab', 'Ghunnah'], tafsir: [] },
        { id: 'student-6', name: 'Ibrahim Khan', dob: '2000-11-12', masteredTajweedRules: ['Qalqalah (Sughra & Kubra)', 'Madd (Natural, Muttasil, Munfasil)'], tafsir: [] },
        { id: 'student-7', name: 'Layla Hussein', dob: '1995-03-30', masteredTajweedRules: [], tafsir: [] },
        { id: 'student-8', name: 'Mustafa Yusuf', dob: '1978-08-05', masteredTajweedRules: [], tafsir: [] },
        { id: 'student-9', name: 'Zainab Tariq', dob: '1965-12-25', masteredTajweedRules: [], tafsir: [] },
        { id: 'student-10', name: 'Adam Bakr', dob: '2016-07-15', masteredTajweedRules: [], tafsir: [] },
        { id: 'student-11', name: 'Omar Qureshi', dob: '2013-04-10', masteredTajweedRules: [], tafsir: [] }
    ];

    const today = new Date();
    
    const historyParams = [
        // Standard students (6 months history)
        { days: 180, freq: 3, verses: { min: 5, max: 15 }, startS: 1, startA: 1 },    // Aisha
        // High-achiever Yusuf (1 year history)
        { days: 365, freq: 2, verses: { min: 40, max: 80 }, startS: 1, startA: 1 }, // Yusuf
        // High-achiever Fatima (1 year history)
        { days: 365, freq: 3, verses: { min: 30, max: 70 }, startS: 1, startA: 1 },  // Fatima
            // Standard students (6 months history)
        { days: 180, freq: 2, verses: { min: 3, max: 10 }, startS: 1, startA: 1 },    // Khalid
        { days: 180, freq: 3, verses: { min: 2, max: 8 }, startS: 1, startA: 1 },     // Sumaya
        { days: 180, freq: 5, verses: { min: 15, max: 30 }, startS: 50, startA: 1 },  // Ibrahim
        { days: 180, freq: 6, verses: { min: 15, max: 40 }, startS: 30, startA: 1 },  // Layla
        { days: 180, freq: 8, verses: { min: 10, max: 20 }, startS: 78, startA: 1 },  // Mustafa
        { days: 180, freq: 10, verses: { min: 5, max: 10 }, startS: 1, startA: 1 },   // Zainab
        { days: 180, freq: 2, verses: { min: 2, max: 7 }, startS: 110, startA: 1 },   // Adam
        { days: 60, freq: 4, verses: { min: 3, max: 8 }, startS: 1, startA: 1 },      // Omar (Inactive)
    ];

    return baseStudents.map((student, index) => {
        const params = historyParams[index];

        const startDate = new Date();
        const inactiveDays = student.id === 'student-11' ? 21 : 0; // Make Omar's last activity 3 weeks ago
        startDate.setDate(today.getDate() - params.days - inactiveDays);

        const { recitation, memorization, attendance } = generateStudentHistory(
            new Date(startDate.getTime()), params.days, params.freq, params.verses, params.startS, params.startA
        );

        return {
            id: student.id, name: student.name, dob: student.dob,
            recitationAchievements: recitation,
            memorizationAchievements: memorization,
            attendance: attendance,
            masteredTajweedRules: student.masteredTajweedRules,
            tafsirReviews: student.tafsir.map((t, i) => ({
                id: `taf-${student.id}-${i}`,
                date: new Date(startDate.getTime() + getRandomInt(0, params.days) * 86400000).toISOString(),
                surah: t.surah, reviewQuality: t.quality
            })),
            tafsirMemorizationReviews: [],
            mistakes: {},
        };
    });
};

// --- General Utilities ---

export const getPageOfAyah = (surahNum: number, ayahNum: number): number => {
    // This function uses a pre-computed list of the first verse of every page
    // to accurately determine the page number for any given verse.
    // It iterates backwards for efficiency, as later verses are more common lookups.
    for (let i = pageVerseList.length - 1; i >= 0; i--) {
        const [pageNum, s, a] = pageVerseList[i];
        if (surahNum > s || (surahNum === s && ayahNum >= a)) {
            return pageNum;
        }
    }
    return 1; // Default to page 1 if not found (e.g., for Surah 1, Ayah 1)
};

export const getRecitedPagesSet = (student: Student): Set<number> => {
    const recitedPages = new Set<number>();
    student.recitationAchievements.forEach(ach => {
        const startPage = getPageOfAyah(ach.startSurah, ach.startAyah);
        const endPage = getPageOfAyah(ach.endSurah, ach.endAyah);
        if (startPage > 0 && endPage > 0) {
            for (let i = startPage; i <= endPage; i++) {
                recitedPages.add(i);
            }
        }
    });
    return recitedPages;
};

export const getMemorizedPagesSet = (student: Student): Set<number> => {
    const memorizedPages = new Set<number>();
    student.memorizationAchievements.forEach(ach => {
        const startPage = getPageOfAyah(ach.startSurah, ach.startAyah);
        const endPage = getPageOfAyah(ach.endSurah, ach.endAyah);
        if (startPage > 0 && endPage > 0) {
            for (let i = startPage; i <= endPage; i++) {
                memorizedPages.add(i);
            }
        }
    });
    return memorizedPages;
};


export const calculateVersesAndPages = (startSurah: number, startAyah: number, endSurah: number, endAyah: number): { verses: number, pages: number } => {
    let versesCompleted = 0;
    
    if (startSurah === endSurah) {
        versesCompleted = endAyah - startAyah; // should not be +1 because it's a range
    } else {
        const startSurahMeta = QURAN_METADATA.find(s => s.number === startSurah);
        if (startSurahMeta) {
            versesCompleted += startSurahMeta.numberOfAyahs - startAyah + 1;
        }

        for (let i = startSurah + 1; i < endSurah; i++) {
            const surahMeta = QURAN_METADATA.find(s => s.number === i);
            if (surahMeta) {
                versesCompleted += surahMeta.numberOfAyahs;
            }
        }
        
        const endSurahMeta = QURAN_METADATA.find(s => s.number === endSurah);
        if (endSurahMeta){
            versesCompleted += endAyah;
        }
    }
    if(versesCompleted < 0) versesCompleted = 0;

    const startPage = getPageOfAyah(startSurah, startAyah);
    const endPage = getPageOfAyah(endSurah, endAyah);

    if (startPage === 0 || endPage === 0) return { verses: versesCompleted, pages: 0 };
    
    const pagesCompleted = endPage - startPage;

    return { verses: Math.max(0, versesCompleted), pages: Math.max(0, pagesCompleted) };
};

const getDefaultTajweedRules = (): string[] => [
  "Izhar", "Idgham", "Iqlab", "Ikhfa",
  "Qalqalah (Sughra & Kubra)", "Madd (Natural, Muttasil, Munfasil)",
  "Rules of Noon Sakinah & Tanween", "Rules of Meem Sakinah",
  "Tafkhim & Tarqiq (Raa)", "Ghunnah",
  "Lam Shamsiyyah & Qamariyyah", "Sifaat al-Huruf (Letter Attributes)",
  "Makharij al-Huruf (Articulation Points)"
];

// --- Quran Data Fetching for Points System ---
const surahCache = new Map<number, QuranVerse[]>();

export const getVersesForSurah = async (surahId: number): Promise<QuranVerse[]> => {
    if (surahCache.has(surahId)) {
        return surahCache.get(surahId)!;
    }
    try {
        const response = await fetch(`https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=${surahId}`);
        if (!response.ok) throw new Error(`Failed to fetch Surah ${surahId}`);
        const data = await response.json();
        surahCache.set(surahId, data.verses);
        return data.verses;
    } catch (e) {
        console.error(e);
        return [];
    }
};

export const getVersesInRange = async (start: Progress, end: Progress): Promise<QuranVerse[]> => {
    const verses: QuranVerse[] = [];
    if (start.surah > end.surah || (start.surah === end.surah && start.ayah > end.ayah)) {
        return [];
    }

    if (start.surah === end.surah) {
        const surahVerses = await getVersesForSurah(start.surah);
        return surahVerses.slice(start.ayah - 1, end.ayah);
    } else {
        // First surah
        const startSurahVerses = await getVersesForSurah(start.surah);
        verses.push(...startSurahVerses.slice(start.ayah - 1));

        // Intermediate surahs
        for (let i = start.surah + 1; i < end.surah; i++) {
            const middleSurahVerses = await getVersesForSurah(i);
            verses.push(...middleSurahVerses);
        }

        // Last surah
        const endSurahVerses = await getVersesForSurah(end.surah);
        verses.push(...endSurahVerses.slice(0, end.ayah));
    }

    return verses;
};