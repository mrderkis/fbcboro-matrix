'use client'

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { fetchMatrixPlans, getIgnoredSettings, toggleIgnoredSetting } from '../actions/pco';

// --- BRAND THEME CONTROL ---
const BRAND_THEME = {
  colors: {
    midnight: '#10313A',
    denim: '#225262',
    sapphire: '#57AAC1',
    pine: '#04473F',
    jade: '#09A889',
    arctic: '#35E1E5',
    honey: '#E5B429',
    apple: '#840639', 
    black: '#090C0F',
    grayMid: '#CECBC6',
    grayLight: '#EAE8E5',
    grayLighter: '#FCF9F5'
  },
  typography: {
    header: 'text-xl',
    countdown: 'text-xl',
    title: 'text-md',
    subtitle: 'text-xs',
    setlist: 'text-[17px]',
    posLabel: 'text-[13px]',
    name: 'text-[22px]',
    declinedHeader: 'text-xs',
    declinedText: 'text-base',
  },
  layout: {
    planInfoHeight: 'h-[350px]', 
    rosterSlotHeight: 'h-[30px]', 
    rosterGap: 'gap-1',
    setlistSlotHeight: 'min-h-[28px]'
  }
};

interface TeamMember { id: string; name: string; position: string; status: 'C' | 'U' | 'D'; }
interface TeamCategory { id: string; name: string; members: TeamMember[]; isEmpty: boolean; }
interface PlanItem { id: string; title: string; type: string; }
interface DashboardPlan { 
  id: string; 
  date: string; 
  startTime: string | null; 
  title: string; 
  series: string; 
  isComplete: boolean; 
  items: PlanItem[]; 
  declined: TeamMember[]; 
  blockouts?: string[]; 
  teams: { vocalists: TeamCategory; rhythm: TeamCategory; tech: TeamCategory; orchestra: TeamCategory; }; 
}
interface GroupedDecline { name: string; positions: string[]; }
interface MatrixViewProps { 
  initialShowTeams?: { vocalists: boolean; rhythm: boolean; tech: boolean; orchestra: boolean; };
  hideControls?: boolean;
}

function ServiceCountdown({ targetTime }: { targetTime: string | null }) {
  const [timeLeft, setTimeLeft] = useState<string>('--:--:--');
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    if (!targetTime) return;
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const target = new Date(targetTime).getTime();
      const diff = target - now;
      if (diff <= 0) { setTimeLeft('SERVICE LIVE'); setIsLive(true); return; }
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`${h > 0 ? h + ':' : ''}${m < 10 && h > 0 ? '0' + m : m}:${s < 10 ? '0' + s : s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  return (
    <div className={`font-mono font-bold tabular-nums ${BRAND_THEME.typography.countdown}`} style={{ color: isLive ? BRAND_THEME.colors.arctic : '#10313A', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', letterSpacing: '0.1em', display: 'inline-block', minWidth: '5ch', textAlign: 'center' }}>
      {timeLeft}
    </div>
  )
}

export default function MatrixView({ initialShowTeams, hideControls = false }: MatrixViewProps) {
  const [serviceCount, setServiceCount] = useState<number>(4);
  const [plans, setPlans] = useState<DashboardPlan[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [ignoredPositions, setIgnoredPositions] = useState<Record<string, boolean>>({});
  const [showTeams, setShowTeams] = useState(initialShowTeams || { vocalists: true, rhythm: true, tech: true, orchestra: false });
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [pixelShift, setPixelShift] = useState({ x: 0, y: 0 });
  const [isNightMode, setIsNightMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(!hideControls);

  const TEAM_COLUMNS: Record<string, { left: string[], right: string[] }> = {
    vocalists: { left: ['RF1', 'RF2', 'RF3', 'RF4', 'RF5', 'RF6'], right: ['RF7', 'RF8', 'RF9', 'RF10', 'RF11'] },
    rhythm: { left: ['DRM', 'Bass', 'EG1', 'EG2'], right: ['AG', 'Keys', 'PNO'] },
    tech: { left: ['DIR', 'PTZ OP', 'CAM 3', 'CAM 4'], right: ['CG1', 'CG2', 'FOH', 'AFV'] }
  };

  const formatName = (n: string) => { const p = n.trim().split(' '); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : n; };
  
  const shortenTitle = (t: string) => {
    return t
      .replace(/Announcement Video/gi, 'Video')
      .replace(/Announce Vid/gi, 'Video')
      .replace(/Pastor Led Prayer Time/gi, 'Prayer')
      .replace(/Pastor Greeting and Welcome/gi, 'Greeting')
      .replace(/Greeting and Welcome/gi, 'Greeting')
      .replace(/Baptismal Service/gi, 'Baptism')
      .replace(/Sermon Bumper/gi, 'Bumper')
      .replace(/Message/gi, 'Sermon');
  };

  const isPlaceholderSong = (t: string) => ['SONG 1', 'SONG 2', 'SONG 3', 'SONG 4', 'SONG 5'].includes(t.toUpperCase().trim());

  const handleToggleIgnore = async (pId: string, pos: string) => {
    const key = `${pId}-${pos}`;
    setIgnoredPositions(prev => ({ ...prev, [key]: !prev[key] }));
    await toggleIgnoredSetting(pId, pos);
  };

  useEffect(() => {
    const syncData = async () => {
      try {
        const [d, s] = await Promise.all([fetchMatrixPlans(serviceCount) as unknown as DashboardPlan[], getIgnoredSettings()]);
        setPlans(d); setIgnoredPositions(s);
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
    };
    const runProtection = () => {
      setPixelShift({ x: Math.floor(Math.random() * 3) - 1, y: Math.floor(Math.random() * 3) - 1 });
      const hour = new Date().getHours();
      setIsNightMode(hour >= 22 || hour < 6);
    };
    const savedTheme = localStorage.getItem('fbcBORO-theme') as 'light' | 'dark';
    if (savedTheme) setTheme(savedTheme);
    syncData(); runProtection();
    const dInt = setInterval(syncData, 60000);
    const pInt = setInterval(runProtection, 60000);
    return () => { clearInterval(dInt); clearInterval(pInt); };
  }, [serviceCount]);

  const renderMember = (pId: string, team: TeamCategory, pos: string) => {
    const person = team.members.find((m: TeamMember) => {
      const cleanM = (m.position || '').toUpperCase().replace(/\s/g, '');
      const cleanP = pos.toUpperCase().replace(/\s/g, '');
      
      const rfMatch = (m.position || '').match(/(RF\d+)/i);
      if (rfMatch && rfMatch[0].toUpperCase() === pos) return true;
      
      if (cleanP === 'AG' && (cleanM.includes('ACOUSTIC') || cleanM === 'AG')) return true;
      if (cleanP === 'DRM' && (cleanM.includes('DRUM') || cleanM.includes('PERC'))) return true;
      if (cleanP === 'BASS' && cleanM.includes('BASS')) return true;
      if (cleanP === 'PNO' && cleanM.includes('PIANO')) return true;
      if (cleanP.startsWith('CAM') && cleanM.startsWith('CAMERA')) return cleanM.replace('CAMERA', 'CAM') === cleanP;
      
      return cleanM === cleanP;
    });

    const isIgnored = !!ignoredPositions[`${pId}-${pos}`];
    const isEmpty = !person;
    const shouldAlert = isEmpty && !isIgnored && !isNightMode;

    return (
      <div key={pos} className={`px-2 py-1 rounded flex flex-row items-center gap-2 relative border transition-all ${BRAND_THEME.layout.rosterSlotHeight} 
        ${shouldAlert ? 'bg-[#840639] animate-song-pulse border-black shadow-md' : 'border-transparent'}
        ${isIgnored && isEmpty ? (theme === 'dark' ? 'bg-[#10313A] opacity-40' : 'bg-[#EAE8E5] opacity-60') : (!shouldAlert ? 'bg-black/10' : '')}`}>
        <div className={`w-12 shrink-0 flex items-center border-r h-full ${shouldAlert ? 'border-white/20' : 'border-white/10'}`}>
          <span className={`${BRAND_THEME.typography.posLabel} font-larken font-black uppercase tracking-tighter leading-none ${shouldAlert ? 'text-white' : 'text-slate-400'}`}>{pos}</span>
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {person ? (
            <><span className={`w-3 h-3 rounded-full shrink-0 ${person.status === 'C' ? 'bg-green-500' : 'bg-yellow-400'}`} /><span className={`${BRAND_THEME.typography.name} font-black leading-none truncate ${theme === 'dark' ? 'text-white' : 'text-[#090C0F]'}`}>{formatName(person.name)}</span></>
          ) : (
            <span className={`${shouldAlert ? 'text-white' : 'text-slate-700'} font-black italic text-[11px] tracking-widest ${shouldAlert ? 'opacity-100' : 'opacity-30'}`}>OPEN</span>
          )}
        </div>
        {isEmpty && <input type="checkbox" checked={isIgnored} onChange={() => handleToggleIgnore(pId, pos)} className="absolute top-1 right-1 w-3 h-3 opacity-10 hover:opacity-100 cursor-pointer accent-black" />}
      </div>
    );
  };

  const renderTeamSection = (pId: string, team: TeamCategory, title: string, tType: string) => {
    const cols = TEAM_COLUMNS[tType];
    if (!cols) return null;
    return (
      <div className="flex flex-col mb-2">
        <h4 className={`${BRAND_THEME.typography.subtitle} font-larken font-black uppercase tracking-widest mb-1 border-b ${theme === 'dark' ? 'text-[#CECBC6] border-[#CECBC6]/30' : 'text-[#CECBC6] border-[#CECBC6]/20'}`}>{title}</h4>
        <div className="grid grid-cols-2 gap-x-3">
          <div className={`flex flex-col ${BRAND_THEME.layout.rosterGap}`}>{cols.left.map(pos => renderMember(pId, team, pos))}</div>
          <div className={`flex flex-col ${BRAND_THEME.layout.rosterGap}`}>{cols.right.map(pos => renderMember(pId, team, pos))}</div>
        </div>
      </div>
    );
  };

  const renderGroupedSetlist = (items: PlanItem[]) => {
    const rows: React.ReactNode[] = [];
    let currentGroup: string[] = [];

    const flushGroup = () => {
      if (currentGroup.length === 0) return;
      const combined = currentGroup.join(' | ');
      rows.push(
        <div key={combined} className={`text-[14px] ${BRAND_THEME.layout.setlistSlotHeight} font-bold leading-tight px-1.5 py-0.5 rounded italic opacity-60 flex items-center ${theme === 'dark' ? 'text-[#CECBC6]' : 'text-gray-600'}`}>
          {combined}
        </div>
      );
      currentGroup = [];
    };

    items.forEach((item, idx) => {
      const title = shortenTitle(item.title);
      const isPl = isPlaceholderSong(item.title);
      const isSong = item.type === 'song' || isPl;

      if (isSong) {
        flushGroup();
        rows.push(
          <div key={item.id} className={`${BRAND_THEME.typography.setlist} ${BRAND_THEME.layout.setlistSlotHeight} font-bold leading-tight truncate px-1.5 py-0.5 rounded flex items-center border shadow-sm
            ${isPl ? 'bg-[#E5B429] text-[#090C0F] animate-song-pulse border-yellow-600' : 'bg-[#57AAC1] text-white border-blue-800 animate-song-pulse'}`}>
            {title}
          </div>
        );
      } else {
        currentGroup.push(title);
        const next = items[idx + 1];
        const nextIsSong = next && (next.type === 'song' || isPlaceholderSong(next.title));
        if (nextIsSong || idx === items.length - 1) flushGroup();
      }
    });

    return rows;
  };

  return (
    <div className={`w-full h-screen flex flex-col p-2 font-poppins overflow-hidden transition-all duration-[10000ms] ${isNightMode ? 'bg-[#090C0F] opacity-30 grayscale' : (theme === 'dark' ? 'bg-[#090C0F]' : 'bg-[#FCF9F5]')}`} style={{ transform: `translate(${pixelShift.x}px, ${pixelShift.y}px)` }}>
      <style>{`
        .font-larken { font-family: var(--font-larken), serif; } 
        .font-poppins { font-family: var(--font-poppins), sans-serif; } 
        
        @keyframes song-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .animate-song-pulse { animation: song-pulse 10s ease-in-out infinite; }
        
        /* Nuke the Next.js Dev/Feedback Overlay */
        #nextjs-portal, 
        [data-nextjs-toast], 
        [data-vercel-feedback-button],
        nextjs-portal { 
          display: none !important; 
          visibility: hidden !important; 
          pointer-events: none !important;
          opacity: 0 !important;
          width: 0 !important;
          height: 0 !important;
        }
      `}</style>
      
      <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="fixed top-4 right-4 z-[100] p-2 rounded-full bg-black/20 hover:bg-black/40 text-white/50 hover:text-white transition-all border border-white/10">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
      </button>

      <div className={`transition-all duration-500 overflow-hidden ${isSettingsOpen ? 'max-h-24 opacity-100 mb-2' : 'max-h-0 opacity-0 mb-0'}`}>
        <div className={`flex items-center justify-between p-2 rounded shadow-sm border shrink-0 ${theme === 'dark' ? 'bg-[#10313A] border-[#225262] text-[#CECBC6]' : 'bg-white border-gray-200 text-gray-500'} ${isNightMode ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-4">
            <div className="relative h-10 w-10"><Image src={theme === 'dark' ? "/DARK_MODE_LOGO.png" : "/LIGHT_MODE_LOGO.png"} alt="FBCBORO" fill sizes="40px" className="object-contain" priority /></div>
            <h2 className={`text-xl font-larken font-black uppercase tracking-tighter ${theme === 'dark' ? 'text-white' : 'text-[#090C0F]'}`}>BORO Matrix</h2>
            <button onClick={() => { const n = theme === 'light' ? 'dark' : 'light'; setTheme(n); localStorage.setItem('fbcBORO-theme', n); }} className={`font-poppins px-3 py-1.5 rounded text-[10px] font-black uppercase border transition-all ${theme === 'dark' ? 'border-[#225262] hover:bg-white/10 text-white' : 'border-gray-200 hover:bg-gray-100 text-gray-600'}`}> {theme === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode'} </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-[10px] font-black tracking-widest uppercase">{(['vocalists', 'rhythm', 'tech', 'orchestra'] as const).map(t => (<label key={t} className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={showTeams[t]} onChange={() => setShowTeams(p => ({ ...p, [t]: !p[t] }))} className="w-3 h-3 accent-black" />{t}</label>))}</div>
            <select value={serviceCount} onChange={(e) => setServiceCount(Number(e.target.value))} className={`font-poppins text-xs border rounded p-1 font-bold ${theme === 'dark' ? 'bg-[#090C0F] border-[#225262] text-white' : 'bg-white border-gray-300'}`}> {[1, 2, 3, 4, 5, 6].map(num => <option key={num} value={num}>{num} SERVICES</option>)} </select>
          </div>
        </div>
      </div>

      {isLoading ? <div className="flex flex-1 items-center justify-center text-gray-500 animate-pulse font-black text-2xl font-larken uppercase">Syncing Planning Center...</div> : (
        <div className={`flex-1 grid gap-2 overflow-hidden ${!isSettingsOpen ? 'pt-2' : ''}`} style={{ gridTemplateColumns: `repeat(${serviceCount}, minmax(0, 1fr))` }}>
          {plans.map((p: DashboardPlan) => (
            <div key={p.id} className={`rounded border-2 flex flex-col h-full overflow-hidden shadow-sm transition-colors duration-500 ${theme === 'dark' ? 'bg-[#10313A]/60 border-[#225262]/40' : 'bg-white border-gray-200'}`}>
              <div className={`p-1.5 border-b-2 shrink-0 flex items-center justify-between px-3 ${p.isComplete ? 'bg-[#10313A] text-white' : 'bg-[#35E1E5] text-[#090C0F]'}`}>
                <h3 className={`${BRAND_THEME.typography.header} font-larken font-black uppercase tracking-tighter leading-none`}>{p.date}</h3>
                <ServiceCountdown targetTime={p.startTime} />
              </div>
              <div className="p-2 overflow-y-auto flex-1 flex flex-col gap-2">
                <div className={`p-3 rounded border shadow-inner shrink-0 ${BRAND_THEME.layout.planInfoHeight} flex flex-col ${theme === 'dark' ? 'bg-[#090C0F] border-[#225262]/30' : 'bg-[#FCF9F5] border-gray-200'}`}>
                  <div className="mb-2"><span className={`${BRAND_THEME.typography.title} font-larken tracking-widest font-black block leading-tight ${theme === 'dark' ? 'text-white' : 'text-[#090C0F]'}`}>{p.title}</span><span className={`${BRAND_THEME.typography.subtitle} font-poppins font-bold uppercase block text-slate-500`}>{p.series}</span></div>
                  <div className={`flex-1 overflow-y-auto flex flex-col gap-1 border-l-4 pl-2 no-scrollbar ${theme === 'dark' ? 'border-[#CECBC6]/30' : 'border-slate-300'}`}>
                    {renderGroupedSetlist(p.items)}
                  </div>
                </div>
                <div className="flex flex-col">
                  {showTeams.vocalists && renderTeamSection(p.id, p.teams.vocalists, 'VOCALISTS', 'vocalists')}
                  {showTeams.rhythm && renderTeamSection(p.id, p.teams.rhythm, 'BAND', 'rhythm')}
                  {showTeams.tech && renderTeamSection(p.id, p.teams.tech, 'TECH', 'tech')}
                  {showTeams.orchestra && renderTeamSection(p.id, p.teams.orchestra, 'ORCHESTRA', 'orchestra')}
                </div>
                
                <div className="mt-auto space-y-2">
                  {p.declined.length > 0 && (
                    <div className={`pt-2 border-t p-2 rounded transition-colors duration-500 ${theme === 'dark' ? 'bg-[#090C0F] border-[#BC1940]/50' : 'bg-[#EAE8E5] border-gray-300'}`}>
                      <h4 className={`${BRAND_THEME.typography.declinedHeader} font-larken font-black text-[#BC1940] uppercase tracking-widest mb-1`}>DECLINED</h4>
                      <div className="flex flex-col gap-1"> {Object.values(p.declined.reduce((acc: Record<string, GroupedDecline>, d: TeamMember) => { const cp = d.position.match(/(RF\d+)/i)?.[0].toUpperCase() || d.position; if (!acc[d.name]) acc[d.name] = { name: d.name, positions: [cp] }; else if (!acc[d.name].positions.includes(cp)) acc[d.name].positions.push(cp); return acc; }, {})).map((g: GroupedDecline) => ( <div key={g.name} className={`${BRAND_THEME.typography.declinedText} flex items-center gap-2 leading-tight`}><span className="text-[#BC1940] line-through font-bold">{formatName(g.name)}</span><span className="text-[10px] text-[#BC1940]/70 font-black">({g.positions.join(',')})</span></div> ))} </div>
                    </div>
                  )}

                  {p.blockouts && p.blockouts.length > 0 && (
                    <div className={`pt-2 border-t p-2 rounded transition-colors duration-500 ${theme === 'dark' ? 'bg-[#090C0F] border-slate-700' : 'bg-slate-100 border-gray-300'}`}>
                      <h4 className={`${BRAND_THEME.typography.declinedHeader} font-larken font-black text-slate-500 uppercase tracking-widest mb-1.5`}>BLOCKOUTS</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {p.blockouts.map((name) => (
                          <div 
                            key={name} 
                            className={`px-1.5 py-0.5 rounded text-[13px] font-bold tracking-tight leading-none opacity-60 ${
                              theme === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {formatName(name)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* NEW: Clean Status Indicator at bottom left clear of the curve */}
      <div className="fixed bottom-3 left-4 z-[200] flex items-center gap-1.5 opacity-50">
        <div className={`w-2 h-2 rounded-full bg-green-500 ${!isLoading ? 'animate-pulse' : ''}`} />
        <span className="text-[10px] font-black uppercase tracking-tighter text-slate-500"></span>
      </div>
    </div>
  );
}