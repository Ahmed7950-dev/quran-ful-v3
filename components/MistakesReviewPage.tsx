import React, { useState, useEffect } from 'react';
import { Student, QuranVerse } from '../types';
import { QURAN_METADATA } from '../constants';
import { useI18n } from '../context/I18nProvider';

// This will be available on the window object from the CDN script
declare const html2pdf: any;

const getMistakeColor = (level: number): string => {
    switch (level) {
        case 1: return 'bg-yellow-200/70 dark:bg-yellow-500/30';
        case 2: return 'bg-orange-300/70 dark:bg-orange-500/30';
        case 3: return 'bg-red-400/70 dark:bg-red-500/30';
        case 4: return 'bg-orange-300/70 dark:bg-orange-500/30'; // correction
        case 5: return 'bg-yellow-200/70 dark:bg-yellow-500/30'; // correction
        default: return 'transparent';
    }
};

const toEasternArabicNumerals = (num: number): string => {
    const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    return String(num).split('').map(digit => arabicNumerals[parseInt(digit, 10)]).join('');
};

interface MistakesReviewPageProps {
  student: Student;
  showTitle?: boolean;
}

type VersesWithMistakes = {
    [surahNum: number]: QuranVerse[];
};

const MistakesReviewPage: React.FC<MistakesReviewPageProps> = ({ student, showTitle = true }) => {
    const { t } = useI18n();
    const [versesWithMistakes, setVersesWithMistakes] = useState<VersesWithMistakes>({});
    const [loading, setLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        const processMistakes = async () => {
            setLoading(true);
            const mistakes = student.mistakes || {};
            const mistakeKeys = Object.keys(mistakes);

            if (mistakeKeys.length === 0) {
                setLoading(false);
                return;
            }

            const surahsToFetch = new Set<number>();
            const mistakesByVerse: { [verseKey: string]: boolean } = {};
            mistakeKeys.forEach(key => {
                const [surah] = key.split(':').map(Number);
                const verseKey = key.split(':').slice(0, 2).join(':');
                surahsToFetch.add(surah);
                mistakesByVerse[verseKey] = true;
            });

            try {
                const surahPromises = Array.from(surahsToFetch).map(async surahId => {
                    const response = await fetch(`https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=${surahId}`);
                    if (!response.ok) throw new Error(`Failed to fetch Surah ${surahId}`);
                    const data = await response.json();
                    return { surahId, verses: data.verses as QuranVerse[] };
                });

                const fetchedSurahs = await Promise.all(surahPromises);
                const allVersesMap: { [surahId: number]: QuranVerse[] } = {};
                fetchedSurahs.forEach(s => {
                    allVersesMap[s.surahId] = s.verses;
                });
                
                const result: VersesWithMistakes = {};
                for (const surahId of Array.from(surahsToFetch).sort((a,b) => a-b)) {
                    const versesInSurah = allVersesMap[surahId];
                    if (versesInSurah) {
                        const versesContainingMistakes = versesInSurah.filter(v => mistakesByVerse[v.verse_key]);
                        if(versesContainingMistakes.length > 0) {
                            result[surahId] = versesContainingMistakes;
                        }
                    }
                }
                setVersesWithMistakes(result);
            } catch (error) {
                console.error("Failed to load verses for mistakes review:", error);
            } finally {
                setLoading(false);
            }
        };

        processMistakes();
    }, [student.mistakes]);

    const handleExportToPdf = async () => {
        if (typeof html2pdf === 'undefined') {
            alert('PDF generation library is not loaded. Please ensure you are connected to the internet and try again.');
            return;
        }

        setIsExporting(true);
        
        const element = document.getElementById('mistakes-review-content');
        if (!element) {
            console.error('Export failed: Could not find element #mistakes-review-content');
            setIsExporting(false);
            return;
        }

        const printHeader = element.querySelector('.print-only') as HTMLElement;
        const isDarkMode = document.documentElement.classList.contains('dark');
        
        // Prepare DOM for capture
        if (isDarkMode) document.documentElement.classList.remove('dark');
        if (printHeader) printHeader.classList.remove('hidden');

        const opt = {
            margin:       0.5, // inches
            filename:     `${student.name.replace(/ /g, '_')}_mistakes_report.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false },
            jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' },
            pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
        };

        try {
            await html2pdf().from(element).set(opt).save();
        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("An error occurred while generating the PDF. Please try again.");
        } finally {
            // Cleanup DOM after capture
            if (isDarkMode) document.documentElement.classList.add('dark');
            if (printHeader) printHeader.classList.add('hidden');
            setIsExporting(false);
        }
    };

    const renderVerseContent = (verse: QuranVerse) => {
        const [surahNum, ayahNum] = verse.verse_key.split(':').map(Number);
        const words = verse.text_uthmani.split(' ');

        return words.map((word, wordIndex) => {
            const key = `${surahNum}:${ayahNum}:${wordIndex}`;
            const mistakeLevel = student.mistakes[key]?.level;
            return (
                <span key={key} className={`px-1 rounded-md ${mistakeLevel ? getMistakeColor(mistakeLevel) : ''}`}>
                    {word}
                </span>
            );
        }).reduce((prev, curr) => <>{prev} {curr}</>);
    };

    if (loading) {
        return <div className="text-center p-8">{t('liveSession.loadingSurah')}</div>;
    }

    if (Object.keys(versesWithMistakes).length === 0) {
        return (
            <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                <p className="font-semibold text-lg text-slate-700 dark:text-slate-200">{t('studentView.noMistakesMashaAllah')}</p>
                <p className="text-slate-500 dark:text-slate-400">{t('studentView.noMistakes')}</p>
            </div>
        );
    }

    return (
        <div id="mistakes-review-content" className="space-y-6">
            <div className="print-only hidden text-center mb-8">
                <h1 className="text-2xl font-bold">Mistakes Report for {student.name}</h1>
                <p className="text-sm text-gray-500">Generated on {new Date().toLocaleDateString()}</p>
            </div>

            <div className="no-print flex justify-between items-center mb-4">
                {showTitle ? (
                    <h2 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">
                        {t('studentView.mistakesReviewTab')}
                    </h2>
                ) : <div />}
                <button
                    onClick={handleExportToPdf}
                    disabled={isExporting}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-wait"
                    title={t('modals.common.exportPDF')}
                >
                    {isExporting ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="hidden sm:inline">{t('modals.exportReport.buttonGenerating')}</span>
                        </>
                    ) : (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6 18.25m0 0a3.75 3.75 0 1 0 7.5 0m-7.5 0h7.5m9-6.75h-4.5m0 0a9.037 9.037 0 0 1-4.5 0m4.5 0V5.625m0 0A2.25 2.25 0 0 0 16.5 3.375h-9A2.25 2.25 0 0 0 5.25 5.625v3.188m11.25 0c0 2.47-2.25 4.5-5.25 4.5S6 13.28 6 10.813m11.25 0-2.438-3.417c-.343-.48-.906-.767-1.516-.767H10.5c-.61 0-1.173.287-1.516.767L6.563 10.813m11.25 0c0-1.255-.32-2.45-.896-3.417M6.563 10.813c-.577.967-.896 2.162-.896 3.417m0 0a48.112 48.112 0 0 0 10.56 0m-10.56 0h10.56" /></svg>
                            <span className="hidden sm:inline">{t('modals.common.exportPDF')}</span>
                        </>
                    )}
                </button>
            </div>

            {Object.entries(versesWithMistakes).map(([surahNum, verses]: [string, QuranVerse[]]) => {
                const surahInfo = QURAN_METADATA.find(s => s.number === Number(surahNum));
                return (
                    <div key={surahNum} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm break-inside-avoid">
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4 pb-2 border-b dark:border-gray-700">
                            {surahInfo?.name} ({surahInfo?.transliteratedName})
                        </h3>
                        <div dir="rtl" className="font-quranic text-3xl text-slate-800 dark:text-slate-100 space-y-4">
                            {verses.map(verse => {
                                const ayahNum = Number(verse.verse_key.split(':')[1]);
                                return (
                                     <div key={verse.verse_key} className="flex flex-row-reverse items-start gap-x-4 py-2 border-b border-gray-100 dark:border-gray-700">
                                        <span className="flex-shrink-0 inline-flex items-center justify-center w-10 h-10 text-lg font-bold text-slate-700 dark:text-slate-200 border-2 rounded-full font-sans" style={{ verticalAlign: 'middle' }}>
                                            {toEasternArabicNumerals(ayahNum)}
                                        </span>
                                        <p className="flex-grow text-right leading-relaxed">
                                            {renderVerseContent(verse)}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default MistakesReviewPage;