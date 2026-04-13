'use client'

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { fetchMatrixPlans, getIgnoredSettings, toggleIgnoredSetting, fetchSpecialPlans } from '../actions/pco';

// --- RESTORED BRAND THEME ---
const BRAND_THEME = {
  colors: {
    midnight: '#10313A',
    denim: '#225262',
    sapphire: '#57AAC1',
    pine: '#04473F',
    jade: '#09A889',
    arctic: '#35E1E5',
    honey: '#E5B429', // Yellow for SONG 1, etc.
    apple: '#840639', // Maroon for OPEN alerts
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
  id: string; date: string; startTime: string | null; title: string; series: string; isComplete: boolean; 
  items: PlanItem[]; declined: TeamMember[]; blockouts?: string[]; 
  teams: { vocalists: TeamCategory; rhythm: TeamCategory; tech: TeamCategory; orchestra: TeamCategory; }; 
}
interface GroupedDecline { name: string; positions: string[]; }

function ServiceCountdown({ targetTime }: { targetTime: string | null }) {
  const [timeLeft, setTimeLeft] = useState<string>('--:--:--');
  useEffect(() => {
    if (!targetTime) return;
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const target = new Date(targetTime).getTime();
      const diff = target - now;
      if (diff <= 0) { setTimeLeft('LIVE'); return; }
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`${m}:${s < 10 ? '0' + s : s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);
  return <div className={`font-mono font-bold tabular-nums ${BRAND_THEME.typography.countdown}`} style={{ color: '#35E1E5', letterSpacing: '0.1em' }}>{timeLeft}</div>;
}

export default function MatrixView({ initialShowTeams, hideControls = false }: any) {
  const [serviceCount, setServiceCount] = useState<number>(4);
  const [plans, setPlans] = useState<DashboardPlan[]>([]);
  const [specialPlans, setSpecialPlans] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [ignoredPositions, setIgnoredPositions] = useState<Record<string, boolean>>({});
  const [showTeams, setShowTeams] = useState(initialShowTeams || { vocalists: true, rhythm: true, tech: true, orchestra: false });
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [isSettingsOpen, setIsSettingsOpen] = useState(!hideControls);

  const TEAM_COLUMNS: Record<string, { left: string[], right: string[] }> = {
    vocalists: { left: ['RF1', 'RF2', 'RF3', 'RF4', 'RF5', 'RF6'], right: ['RF7', 'RF8', 'RF9', 'RF10', 'RF11'] },
    rhythm: { left: ['DRM', 'Bass', 'EG1', 'EG2'], right: ['AG', 'Keys', 'PNO'] },
    tech: { left: ['DIR', 'PTZ OP', 'CAM 3', 'CAM 4'], right: ['CG1', 'CG2', 'FOH', 'AFV'] }
  };

  const formatName = (n: string) => { const p = n.trim().split(' '); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : n; };
  const shortenTitle = (t: string) => t.replace(/Announcement Video/gi, 'Video').replace(/Pastor Led Prayer/gi, 'Prayer').replace(/Sermon Bumper/gi, 'Bumper').replace(/Message/gi, 'Sermon');
  const isPlaceholderSong = (t: string) => ['SONG 1', 'SONG 2', 'SONG 3', 'SONG 4', 'SONG 5'].includes(t.toUpperCase().trim());

  useEffect(() => {
    const syncData = async () => {
      try {
        const [sundayData, settings, specials] = await Promise.all([
          fetchMatrixPlans(serviceCount), 
          getIgnoredSettings(),
          fetchSpecialPlans()
        ]);
        setPlans(sundayData as any);
        setIgnoredPositions(settings);
        setSpecialPlans(specials);
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
    };
    syncData();
    const interval = setInterval(syncData, 60000);
    return () => clearInterval(interval);
  }, [serviceCount]);

  const renderMember = (pId: string, team: TeamCategory, pos: string) => {
    const person = team?.members?.find((m: any) => {
      const cleanM = (m.position || '').toUpperCase().replace(/\s/g, '');
      const cleanP = pos.toUpperCase().replace(/\s/g, '');
      if ((m.position || '').match(/(RF\d+)/i)?.[0].toUpperCase() === pos) return true;
      if (cleanP === 'AG' && (cleanM.includes('ACOUSTIC') || cleanM === 'AG')) return true;
      if (cleanP === 'DRM' && (cleanM.includes('DRUM') || cleanM.includes('PERC'))) return true;
      if (cleanP === 'BASS' && cleanM.includes('BASS')) return true;
      if (cleanP === 'PNO' && cleanM.includes('PIANO')) return true;
      if (cleanP.startsWith('CAM') && cleanM.startsWith('CAMERA')) return cleanM.replace('CAMERA', 'CAM') === cleanP;
      return cleanM === cleanP;
    });

    const isIgnored = !!ignoredPositions[`${pId}-${pos}`];
    const shouldAlert = !person && !isIgnored;

    return (
      <div key={pos} className={`px-2 py-1 rounded flex items-center gap-2 border transition-all ${BRAND_THEME.layout.rosterSlotHeight} ${shouldAlert ? 'bg-[#840639] animate-song-pulse border-black shadow-md' : 'border-transparent bg-black/10'}`}>
        <span className={`${BRAND_THEME.typography.posLabel} font-black w-10 text-slate-400 border-r border-white/10 mr-1 uppercase`}>{pos}</span>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {person ? (
            <><span className={`w-3 h-3 rounded-full ${person.status === 'C' ? 'bg-green-500' : 'bg-yellow-400'}`} /><span className={`${BRAND_THEME.typography.name} font-black truncate text-white leading-none`}>{formatName(person.name)}</span></>
          ) : (
            <span className={`${shouldAlert ? 'text-white' : 'text-slate-700'} font-black italic text-[11px] tracking-widest ${shouldAlert ? 'opacity-100' : 'opacity-30'}`}>OPEN</span>
          )}
        </div>
        {!person && <input type="checkbox" checked={isIgnored} onChange={async () => {
          setIgnoredPositions(prev => ({...prev, [`${pId}-${pos}`]: !isIgnored}));
          await toggleIgnoredSetting(pId, pos);
        }} className="opacity-0 hover:opacity-100 w-3 h-3 cursor-pointer" />}
      </div>
    );
  };

  const renderTeamSection = (pId: string, team: TeamCategory, title: string, tType: string) => {
    const cols = TEAM_COLUMNS[tType];
    if (!cols || !team) return null;
    return (
      <div className="mb-2">
        <h4 className={`${BRAND_THEME.typography.subtitle} font-larken font-black uppercase text-[#CECBC6] border-b border-white/10 mb-1`}>{title}</h4>
        <div className="grid grid-cols-2 gap-1">
          <div className="flex flex-col gap-1">{cols.left.map(pos => renderMember(pId, team, pos))}</div>
          <div className="flex flex-col gap-1">{cols.right.map(pos => renderMember(pId, team, pos))}</div>
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
      rows.push(<div key={combined} className={`text-[14px] ${BRAND_THEME.layout.setlistSlotHeight} font-bold leading-tight px-1.5 py-0.5 rounded italic opacity-60 flex items-center text-[#CECBC6]`}>{combined}</div>);
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
            {title.toUpperCase()}
          </div>
        );
      } else {
        currentGroup.push(title);
        if (idx === items.length - 1 || items[idx+1].type === 'song' || isPlaceholderSong(items[idx+1].title)) flushGroup();
      }
    });
    return rows;
  };

  const renderSpecialBox = (title: string, data: any) => (
    <div className="flex-1 flex flex-col p-2 rounded border-2 mb-2 last:mb-0 bg-[#10313A]/60 border-[#225262]/40">
      <div className="flex justify-between items-baseline mb-2 border-b border-white/10 pb-1">
        <h4 className="text-[15px] font-black uppercase text-slate-200 tracking-widest">{title}</h4>
        <span className="text-[18px] font-black text-[#35E1E5]">{data?.date || '--/--'}</span>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1">
        {!data?.exists ? (
          <div className="bg-[#E5B429] text-black p-2 rounded font-black text-[10px] uppercase text-center mt-4">NO PLAN CREATED</div>
        ) : data.songs.length === 0 ? (
          <div className="bg-[#E5B429] text-black p-2 rounded font-black text-[12px] uppercase text-center mt-4">BLANK</div>
        ) : (
          data.songs.map((s: string, i: number) => (
            <div key={i} className="text-[12px] font-bold px-2 py-1 rounded border border-blue-900/30 bg-[#225262]/50 text-white truncate animate-song-pulse">{s.toUpperCase()}</div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="w-full h-screen bg-[#090C0F] p-2 flex flex-col overflow-hidden text-white font-poppins">
      <style>{`
        @keyframes song-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        .animate-song-pulse { animation: song-pulse 10s ease-in-out infinite; }
        ::-webkit-scrollbar { display: none !important; }
        html, body { overflow: hidden; -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {isSettingsOpen && (
        <div className="flex items-center justify-between p-2 mb-2 bg-[#10313A] rounded border border-[#225262]">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 relative"><Image src="/DARK_MODE_LOGO.png" alt="FBC" fill className="object-contain" /></div>
            <h2 className="text-xl font-black uppercase font-larken">Matrix</h2>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-black uppercase">
            {Object.keys(showTeams).map(t => (
              <label key={t} className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={(showTeams as any)[t]} onChange={() => setShowTeams((p:any) => ({...p, [t]: !(showTeams as any)[t]}))} className="accent-white" /> {t}</label>
            ))}
            <select value={serviceCount} onChange={(e) => setServiceCount(Number(e.target.value))} className="bg-black border border-white/20 p-1 rounded">
              {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} SERVICES</option>)}
            </select>
          </div>
        </div>
      )}

      {isLoading ? <div className="flex-1 flex items-center justify-center font-black animate-pulse uppercase">Syncing Planning Center...</div> : (
        <div className="flex-1 grid gap-2 overflow-hidden" style={{ gridTemplateColumns: `repeat(${serviceCount}, 1fr) 0.5fr` }}>
          {plans.map((p) => (
            <div key={p.id} className="rounded border-2 border-[#225262]/40 bg-[#10313A]/30 flex flex-col h-full overflow-hidden shadow-lg">
              <div className={`p-2 border-b-2 flex justify-between items-center ${p.isComplete ? 'bg-[#10313A]' : 'bg-[#35E1E5] text-black'}`}>
                <h3 className="font-black font-larken text-xl uppercase tracking-tighter">{p.date}</h3>
                <ServiceCountdown targetTime={p.startTime} />
              </div>
              
              <div className="p-2 overflow-y-auto flex-1 flex flex-col no-scrollbar">
                <div className="bg-black/40 p-2 rounded border border-white/5 h-[340px] flex flex-col shrink-0 mb-3">
                  <span className="font-black text-sm block truncate leading-tight text-white">{p.title}</span>
                  <span className="text-[10px] font-bold text-slate-500 block mb-2 uppercase tracking-widest">{p.series}</span>
                  <div className="flex-1 overflow-y-auto no-scrollbar space-y-1 border-l-2 border-white/10 pl-2">
                    {renderGroupedSetlist(p.items)}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  {showTeams.vocalists && renderTeamSection(p.id, p.teams.vocalists, 'VOCALISTS', 'vocalists')}
                  {showTeams.rhythm && renderTeamSection(p.id, p.teams.rhythm, 'BAND', 'rhythm')}
                  {showTeams.tech && renderTeamSection(p.id, p.teams.tech, 'TECH', 'tech')}
                </div>

                {/* FOOTER PINNED TO BOTTOM */}
                <div className="mt-auto space-y-2 pt-4">
                  {p.declined.length > 0 && (
                    <div className="bg-red-900/20 border border-red-500/30 p-2 rounded">
                      <span className="text-[14px] font-black text-red-500 block mb-1 uppercase tracking-widest">DECLINED</span>
                      {p.declined.map(d => <div key={d.id} className="text-[14px] line-through text-red-400 font-bold leading-none mb-1">{formatName(d.name)} <span className="text-[10px] opacity-60">({d.position})</span></div>)}
                    </div>
                  )}
                  {p.blockouts && p.blockouts.length > 0 && (
                    <div className="bg-slate-800/40 p-2 rounded border border-slate-700">
                      <span className="text-[14px] font-black text-slate-500 block mb-1 uppercase tracking-widest">BLOCKOUTS</span>
                      <div className="flex flex-wrap gap-1">{p.blockouts.map(name => <span key={name} className="bg-slate-700 px-1.5 py-0.5 rounded text-[15px] font-bold opacity-60">{formatName(name)}</span>)}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* REHEARSAL COLUMN */}
          <div className="flex flex-col h-full gap-2">
            {renderSpecialBox("Choir Rehearsal", specialPlans?.[0])}
            {renderSpecialBox("Student Choir", specialPlans?.[1])}
          </div>
        </div>
      )}
    </div>
  );
}