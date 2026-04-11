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
    apple: '#BC1940',
    black: '#090C0F',
    grayMid: '#CECBC6',
    grayLight: '#EAE8E5',
    grayLighter: '#FCF9F5'
  },
  typography: {
    header: 'text-xl',
    countdown: 'text-2xl',
    title: 'text-lg',
    subtitle: 'text-xs',
    setlist: 'text-[15px]',
    posLabel: 'text-[11px]',
    name: 'text-[19px]',
    declinedHeader: 'text-xs',
    declinedText: 'text-base',
  },
  // --- FIXED SPACING CONTROL ---
  layout: {
    rosterSlotHeight: 'h-[52px]', // Strictly locks the height of every name slot
    rosterGap: 'gap-1',
    setlistSlotHeight: 'min-h-[26px]'
  }
};

// --- STRICT INTERFACES ---
interface TeamMember { id: string; name: string; position: string; status: 'C' | 'U' | 'D'; }
interface TeamCategory { id: string; name: string; members: TeamMember[]; isEmpty: boolean; }
interface PlanItem { id: string; title: string; type: string; }
interface DashboardPlan { id: string; date: string; startTime: string | null; title: string; series: string; isComplete: boolean; items: PlanItem[]; declined: TeamMember[]; teams: { vocalists: TeamCategory; rhythm: TeamCategory; tech: TeamCategory; orchestra: TeamCategory; }; }
interface GroupedDecline { name: string; positions: string[]; }
interface MatrixViewProps { initialShowTeams?: { vocalists: boolean; rhythm: boolean; tech: boolean; orchestra: boolean; } }

/**
 * SERVICE COUNTDOWN
 */
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

  const color = isLive ? BRAND_THEME.colors.arctic : BRAND_THEME.colors.honey;
  return <div className={`font-larken font-black tabular-nums tracking-tighter ${BRAND_THEME.typography.countdown}`} style={{ color }}>{timeLeft}</div>;
}

export default function MatrixView({ initialShowTeams }: MatrixViewProps) {
  const [serviceCount, setServiceCount] = useState<number>(4);
  const [plans, setPlans] = useState<DashboardPlan[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [ignoredPositions, setIgnoredPositions] = useState<Record<string, boolean>>({});
  const [showTeams, setShowTeams] = useState(initialShowTeams || { vocalists: true, rhythm: true, tech: true, orchestra: false });

  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [pixelShift, setPixelShift] = useState({ x: 0, y: 0 });
  const [isNightMode, setIsNightMode] = useState(false);

  const STATIC_ROSTERS: Record<string, string[]> = {
    vocalists: ['RF1', 'RF2', 'RF3', 'RF4', 'RF5', 'RF6', 'RF7', 'RF8', 'RF9', 'RF10', 'RF11'],
    rhythm: ['Drums', 'Bass Guitar', 'EG1', 'EG2', 'Keys', 'Piano'],
    tech: ['Director', 'PTZ OP', 'CAM 3', 'CAM 4', 'CG1', 'CG2']
  };

  const formatName = (n: string) => { const p = n.trim().split(' '); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : n; };
  const shortenTitle = (t: string) => t.replace(/Pastor Led Prayer Time/gi, 'Prayer Time').replace(/Pastor Greeting and Welcome/gi, 'Greeting').replace(/Greeting and Welcome/gi, 'Greeting').replace(/Announcement Video/gi, 'Announce Vid');
  const isPlaceholderSong = (t: string) => ['SONG 1', 'SONG 2', 'SONG 3', 'SONG 4', 'SONG 5'].includes(t.toUpperCase().trim());

  const handleToggleIgnore = async (pId: string, pos: string) => {
    const key = `${pId}-${pos}`;
    setIgnoredPositions(prev => ({ ...prev, [key]: !prev[key] }));
    await toggleIgnoredSetting(pId, pos);
  };

  useEffect(() => {
    const syncData = async () => {
      try {
        const [d, s] = await Promise.all([
          fetchMatrixPlans(serviceCount) as unknown as DashboardPlan[],
          getIgnoredSettings()
        ]);
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

  const renderTeamCell = (pId: string, team: TeamCategory, title: string, tType: string) => {
    const roster = STATIC_ROSTERS[tType];
    if (!roster) return null;

    return (
      <div className={`flex flex-col font-poppins mb-4`}>
        <h4 className={`${BRAND_THEME.typography.subtitle} font-larken font-black uppercase tracking-widest mb-1 border-b ${theme === 'dark' ? 'text-[#CECBC6] border-[#CECBC6]/30' : 'text-[#CECBC6] border-[#CECBC6]/20'}`}>{title}</h4>
        <div className={`flex flex-col ${BRAND_THEME.layout.rosterGap}`}>
          {roster.map(pos => {
            const person = team.members.find((m: TeamMember) => {
              const cleanM = m.position.toUpperCase().replace(/\s/g, '');
              const cleanP = pos.toUpperCase().replace(/\s/g, '');
              if (m.position.match(/(RF\d+)/i)?.[0].toUpperCase() === pos) return true;
              if (cleanP === 'DRUMS' && (cleanM.includes('DRUM') || cleanM.includes('PERC'))) return true;
              if (cleanP === 'BASSGUITAR' && cleanM.includes('BASS')) return true;
              if (cleanP.startsWith('CAM') && cleanM.startsWith('CAMERA')) return cleanM.replace('CAMERA', 'CAM') === cleanP;
              return cleanM === cleanP;
            });
            const isIgnored = !!ignoredPositions[`${pId}-${pos}`];
            const isEmpty = !person;
            const shouldAlert = isEmpty && !isIgnored && !isNightMode;

            return (
              <div key={pos} className={`px-2 py-1 rounded flex flex-col relative border transition-all ${BRAND_THEME.layout.rosterSlotHeight} 
                ${shouldAlert ? 'animate-breathing-alert border-black shadow-md' : 'border-transparent'}
                ${isIgnored && isEmpty ? (theme === 'dark' ? 'bg-[#10313A] opacity-40' : 'bg-[#EAE8E5] opacity-60') : ''}`}>
                {isEmpty && <input type="checkbox" checked={isIgnored} onChange={() => handleToggleIgnore(pId, pos)} className="absolute top-1 right-1 w-3 h-3 opacity-20 hover:opacity-100 cursor-pointer accent-black" />}
                <span className={`${BRAND_THEME.typography.posLabel} font-larken font-black uppercase tracking-tighter leading-none ${shouldAlert ? 'text-inherit' : 'text-slate-500'}`}>{pos}</span>
                <div className="flex items-center gap-2 flex-1">
                  {person && <><span className={`w-2.5 h-2.5 rounded-full shrink-0 ${person.status === 'C' ? 'bg-green-500' : 'bg-yellow-400'}`} /><span className={`${BRAND_THEME.typography.name} font-black leading-none truncate ${theme === 'dark' ? 'text-white' : 'text-[#090C0F]'}`}>{formatName(person.name)}</span></>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div 
      className={`w-full h-screen flex flex-col p-2 font-poppins overflow-hidden transition-all duration-[10000ms]
        ${isNightMode ? 'bg-[#090C0F] opacity-30 grayscale' : (theme === 'dark' ? 'bg-[#090C0F]' : 'bg-[#FCF9F5]')}
      `}
      style={{ transform: `translate(${pixelShift.x}px, ${pixelShift.y}px)` }}
    >
      <style>{`
        .font-larken { font-family: var(--font-larken), serif; }
        .font-poppins { font-family: var(--font-poppins), sans-serif; }
        @keyframes breathing-alert { 
          0%, 100% { background-color: #BC1940; color: #FFFFFF; } 
          50% { background-color: transparent; color: ${theme === 'dark' ? '#FFFFFF' : '#090C0F'}; } 
        } 
        .animate-breathing-alert { animation: breathing-alert 15s ease-in-out infinite; }
      `}</style>
      
      <div className={`mb-2 flex items-center justify-between p-2 rounded shadow-sm border shrink-0 transition-colors duration-500
        ${theme === 'dark' ? 'bg-[#10313A] border-[#225262] text-[#CECBC6]' : 'bg-white border-gray-200 text-gray-500'}
        ${isNightMode ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-4">
          <div className="relative h-10 w-10">
            <Image src={theme === 'dark' ? "/DARK_MODE_LOGO.png" : "/LIGHT_MODE_LOGO.png"} alt="FBCBORO" fill className="object-contain" priority /><Image 
  src={theme === 'dark' ? "/DARK_MODE_LOGO.png" : "/LIGHT_MODE_LOGO.png"} 
  alt="FBCBORO" 
  fill 
  sizes="40px" // Tells Next.js the image is always roughly 40px wide
  className="object-contain" 
  priority 
/>
          </div>
          <h2 className={`text-xl font-larken font-black uppercase tracking-tighter ${theme === 'dark' ? 'text-white' : 'text-[#090C0F]'}`}>BORO Matrix</h2>
          <button onClick={() => { const n = theme === 'light' ? 'dark' : 'light'; setTheme(n); localStorage.setItem('fbcBORO-theme', n); }} className={`font-poppins px-3 py-1.5 rounded text-[10px] font-black uppercase border transition-all ${theme === 'dark' ? 'border-[#225262] hover:bg-white/10 text-white' : 'border-gray-200 hover:bg-gray-100 text-gray-600'}`}>
            {theme === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode'}
          </button>
        </div>
        
        <div className="flex items-center gap-4 font-poppins">
          <div className="flex items-center gap-3 text-xs font-bold">
            {(['vocalists', 'rhythm', 'tech', 'orchestra'] as const).map(t => (
              <label key={t} className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={showTeams[t]} onChange={() => setShowTeams(p => ({ ...p, [t]: !p[t] }))} className="w-3 h-3 accent-black" />
                {t.toUpperCase()}
              </label>
            ))}
          </div>
          <select value={serviceCount} onChange={(e) => setServiceCount(Number(e.target.value))} className={`font-poppins text-xs border rounded p-1 font-bold ${theme === 'dark' ? 'bg-[#090C0F] border-[#225262] text-white' : 'bg-white border-gray-300'}`}>
            {[1, 2, 3, 4, 5, 6].map(num => <option key={num} value={num}>{num} SERVICES</option>)}
          </select>
        </div>
      </div>

      {isLoading ? <div className="flex flex-1 items-center justify-center text-gray-500 animate-pulse font-black text-2xl font-larken">SYNCING...</div> : (
        <div className="flex-1 grid gap-2 overflow-hidden font-poppins" style={{ gridTemplateColumns: `repeat(${serviceCount}, minmax(0, 1fr))` }}>
          {plans.map((p: DashboardPlan) => (
            <div key={p.id} className={`rounded border-2 flex flex-col h-full overflow-hidden shadow-sm transition-colors duration-500
              ${theme === 'dark' ? 'bg-[#10313A]/60 border-[#225262]/40' : 'bg-white border-gray-200'}`}>
              
              <div className={`p-1.5 border-b-2 shrink-0 flex items-center justify-between px-3 ${p.isComplete ? 'bg-[#10313A] text-white' : 'bg-[#35E1E5] text-[#090C0F]'}`}>
                <h3 className={`${BRAND_THEME.typography.header} font-larken font-black uppercase tracking-tighter leading-none`}>{p.date}</h3>
                <ServiceCountdown targetTime={p.startTime} />
              </div>

              <div className="p-3 overflow-y-auto flex-1 flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3 items-start">
                  <div className={`p-2 rounded border shadow-inner ${theme === 'dark' ? 'bg-[#090C0F] border-[#225262]/30' : 'bg-[#FCF9F5] border-gray-200'}`}>
                    <span className={`${BRAND_THEME.typography.title} font-larken font-black block leading-tight ${theme === 'dark' ? 'text-white' : 'text-[#090C0F]'}`}>{p.title}</span>
                    <span className={`${BRAND_THEME.typography.subtitle} font-poppins font-bold uppercase block mb-2 text-slate-500`}>{p.series}</span>
                    <div className={`flex flex-col gap-1 border-l-4 pl-2 ${theme === 'dark' ? 'border-[#CECBC6]/30' : 'border-slate-300'}`}>
                      {p.items.map((i: PlanItem) => {
                        const isPl = isPlaceholderSong(i.title);
                        const isS = i.type === 'song' && !isPl;
                        return <div key={i.id} className={`${BRAND_THEME.typography.setlist} ${BRAND_THEME.layout.setlistSlotHeight} font-bold leading-tight truncate px-1.5 py-0.5 rounded flex items-center 
                          ${isPl ? 'bg-[#E5B429] text-[#090C0F] animate-pulse border border-yellow-600' : 
                            isS ? 'bg-[#57AAC1] text-white border border-blue-800 shadow-sm' : 
                            (theme === 'dark' ? 'text-[#EAE8E5]' : 'text-gray-800')}`}>{shortenTitle(i.title)}</div>;
                      })}
                    </div>
                  </div>
                  <div className="flex flex-col">
                    {showTeams.vocalists && renderTeamCell(p.id, p.teams.vocalists, 'VOCALISTS', 'vocalists')}
                    {showTeams.rhythm && renderTeamCell(p.id, p.teams.rhythm, 'BAND', 'rhythm')}
                    {showTeams.tech && renderTeamCell(p.id, p.teams.tech, 'TECH', 'tech')}
                    {showTeams.orchestra && renderTeamCell(p.id, p.teams.orchestra, 'ORCHESTRA', 'orchestra')}
                  </div>
                </div>

                {p.declined.length > 0 && (
                  <div className={`mt-auto pt-2 border-t p-3 rounded transition-colors duration-500 ${theme === 'dark' ? 'bg-[#090C0F] border-[#BC1940]/50' : 'bg-[#EAE8E5] border-gray-300'}`}>
                    <h4 className={`${BRAND_THEME.typography.declinedHeader} font-larken font-black text-[#BC1940] uppercase tracking-widest mb-1`}>DECLINED</h4>
                    <div className="flex flex-col gap-1 font-poppins">
                      {Object.values(p.declined.reduce((acc: Record<string, GroupedDecline>, d: TeamMember) => {
                        const cp = d.position.match(/(RF\d+)/i)?.[0].toUpperCase() || d.position;
                        if (!acc[d.name]) acc[d.name] = { name: d.name, positions: [cp] };
                        else if (!acc[d.name].positions.includes(cp)) acc[d.name].positions.push(cp);
                        return acc;
                      }, {})).map((g: GroupedDecline) => (
                        <div key={g.name} className={`${BRAND_THEME.typography.declinedText} flex items-center gap-2 leading-tight`}><span className="text-[#BC1940] line-through font-bold">{formatName(g.name)}</span><span className="text-xs text-[#BC1940]/70 font-black">({g.positions.join(',')})</span></div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}