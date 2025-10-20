import React from 'react';
import { useI18n } from '../context/I18nProvider';

const Logo: React.FC = () => {
    const { t } = useI18n();
    return (
    <div className="flex items-center gap-3">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="logoGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" className="stop-teal-500 dark:stop-teal-400" />
            <stop offset="100%" className="stop-orange-500 dark:stop-orange-400" />
            </linearGradient>
            <style>{`
            .stop-teal-500 { stop-color: #14b8a6; }
            .dark .stop-teal-400 { stop-color: #2dd4bf; }
            .stop-orange-500 { stop-color: #f97316; }
            .dark .stop-orange-400 { stop-color: #fb923c; }
            `}</style>
        </defs>
        {/* Book Shape */}
        <path 
            d="M12 6C12 6 8 4 4 4V18C8 18 12 20 12 20M12 6C12 6 16 4 20 4V18C16 18 12 20 12 20" 
            className="stroke-slate-400 dark:stroke-slate-500" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
        />
        {/* Plus Sign */}
        <path d="M12 8V16" stroke="url(#logoGradient)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M8 12H16" stroke="url(#logoGradient)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <div>
        <h1 className="text-2xl font-bold text-slate-700 dark:text-slate-100">
            {t('header.title')}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('header.tagline')}
        </p>
        </div>
    </div>
    );
};

export default Logo;