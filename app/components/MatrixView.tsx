'use client'

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { fetchMatrixPlans, getIgnoredSettings, toggleIgnoredSetting, fetchSpecialPlans } from '../actions/pco';

const BRAND_THEME = {
  colors: { midnight: '#10313A', denim: '#225262', arctic: '#35E1E5', honey: '#E5B429', apple: '#840639', black: '#090C0F' },
  typography: { header: 'text-xl', setlist: 'text-[17px]', posLabel: 'text-[13px]', name: 'text-[22px]' },
  layout: { rosterSlotHeight: 'h-[30px]', setlistSlotHeight: 'min-h-[28px]' }
};

interface TeamMember { id: string; name: string; position: string; status: 'C' | 'U' | 'D'; notificationsSent: boolean; }
interface TeamCategory { id: string; name: string; members: TeamMember[]; isEmpty: boolean; }
interface PlanItem { id: string; title: string; type: string; songLeader?: string; }
interface DashboardPlan {
  id: string; date: string; startTime: string | null; title: string; series: string; isComplete: boolean;
  items: PlanItem[]; declined: TeamMember[]; blockouts?: string[];
  teams: { vocalists: TeamCategory; rhythm: TeamCategory; tech: TeamCategory; orchestra: TeamCategory; safety: TeamCategory; };
}

function ServiceCountdown({ targetTime }: { targetTime: string | null }) {
  const [timeLeft, setTimeLeft] = useState<string>('--:--');
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
  return <div className="font-mono font-bold text-xl tabular-nums text-[#35E1E5]">{timeLeft}</div>;
}

export default function MatrixView({
  initialShowTeams,
  hideControls = false,
  initialServiceCount = 4,
  showSpecials = true,
  isBroadcast = false
}: any) {
  const [serviceCount, setServiceCount] = useState<number>(initialServiceCount);
  const [plans, setPlans] = useState<DashboardPlan[]>([]);
  const [specialPlans, setSpecialPlans] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [ignoredPositions, setIgnoredPositions] = useState<Record<string, boolean>>({});
  const [showTeams, setShowTeams] = useState(initialShowTeams || { vocalists: true, rhythm: true, tech: true, safety: true, orchestra: false });

  // Restored the cog wheel setting toggle!
  const [isSettingsOpen, setIsSettingsOpen] = useState(!hideControls);

  const TEAM_COLUMNS: Record<string, { left: string[], right: string[] }> = {
    vocalists: { left: ['RF1', 'RF2', 'RF3', 'RF4', 'RF5', 'RF6'], right: ['RF7', 'RF8', 'RF9', 'RF10', 'RF11'] },
    rhythm: { left: ['DRM', 'Bass', 'EG1', 'EG2'], right: ['AG', 'Keys', 'PNO'] },
    tech: { left: ['DIR', 'PTZ OP', 'CAM 3', 'CAM 4'], right: ['CG1', 'CG2', 'FOH', 'AFV'] },
    safety: { left: ['S1', 'S2', 'S3'], right: ['S4', 'S5', 'S6'] }
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  const formatName = (n: string) => { const p = n.trim().split(' '); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : n; };
  const shortenTitle = (t: string) => t.replace(/Announcement Video/gi, 'Video').replace(/Pastor Led Prayer/gi, 'Prayer').replace(/Sermon Bumper/gi, 'Bumper').replace(/Message/gi, 'Sermon');
  const isPlaceholderSong = (t: string) => ['SONG 1', 'SONG 2', 'SONG 3', 'SONG 4', 'SONG 5'].includes(t.toUpperCase().trim());

  useEffect(() => {
    const syncData = async () => {
      try {
        const [sundayData, settings] = await Promise.all([fetchMatrixPlans(serviceCount), getIgnoredSettings()]);
        setPlans(sundayData as any);
        setIgnoredPositions(settings);
        if (showSpecials) { setSpecialPlans(await fetchSpecialPlans()); }
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
    };
    syncData();
    const interval = setInterval(syncData, 300000);
    //const interval = setInterval(syncData, 60000);
    return () => clearInterval(interval);
  }, [serviceCount, showSpecials]);

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
          <div key={item.id} className={`${BRAND_THEME.typography.setlist} ${BRAND_THEME.layout.setlistSlotHeight} font-bold leading-tight px-2 py-0.5 rounded flex items-center justify-between border shadow-sm ${isPl ? 'animate-song-pulse bg-[#E5B429] text-black border-yellow-700' : 'bg-[#57AAC1] text-white border-blue-800'}`}>
            <span className="truncate uppercase">{title}</span>
            {item.songLeader && (
              <div className="w-6 h-6 rounded-full border-2 border-white/40 flex items-center justify-center shrink-0 bg-black/20 ml-1">
                <span className="text-[10px] font-black">{getInitials(item.songLeader)}</span>
              </div>
            )}
          </div>
        );
      } else {
        currentGroup.push(title);
        if (idx === items.length - 1 || items[idx + 1].type === 'song' || isPlaceholderSong(items[idx + 1].title)) flushGroup();
      }
    });
    return rows;
  };

  const renderMember = (pId: string, team: TeamCategory, pos: string) => {
    const person = team?.members?.find((m: any) => {
      const cleanM = (m.position || '').toUpperCase().replace(/\s/g, '');
      const cleanP = pos.toUpperCase().replace(/\s/g, '');
      if ((m.position || '').match(/(RF\d+|S\d+)/i)?.[0].toUpperCase() === pos) return true;
      return cleanM === cleanP;
    });

    const isIgnored = !!ignoredPositions[`${pId}-${pos}`];
    const shouldAlert = !person && !isIgnored;

    return (
      <div key={pos} className={`px-2 py-1 rounded flex items-center gap-2 border transition-all ${BRAND_THEME.layout.rosterSlotHeight} ${shouldAlert ? 'bg-[#840639] animate-song-pulse border-black shadow-md' : 'border-transparent bg-black/10'}`}>
        <span className="text-[11px] font-black w-9 text-slate-400 border-r border-white/10 mr-1 uppercase shrink-0">{pos}</span>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          {person ? (
            <>
              <span className={`w-3 h-3 rounded-full shrink-0 ${person.status === 'C' ? 'bg-green-500' : 'bg-yellow-400'}`} />
              <span className={`${BRAND_THEME.typography.name} font-black truncate text-white leading-none`}>{formatName(person.name)}</span>
              {!person.notificationsSent && (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E5B429" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
              )}
            </>
          ) : (
            <span className={`${shouldAlert ? 'text-white' : 'text-slate-700'} font-black italic text-[11px] tracking-widest ${shouldAlert ? 'opacity-100' : 'opacity-30'}`}>OPEN</span>
          )}
        </div>
      </div>
    );
  };

  const renderTeamSection = (pId: string, team: TeamCategory, title: string, tType: string) => {
    const cols = TEAM_COLUMNS[tType];
    if (!cols || !team) return null;

    const isSingleCol = isBroadcast && (tType === 'tech' || tType === 'safety');

    return (
      <div className="mb-2">
        <h4 className="text-[10px] font-black uppercase text-[#CECBC6] border-b border-white/10 mb-1">{title}</h4>
        <div className={`grid gap-1 ${isSingleCol ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {isSingleCol ? (
            <div className="flex flex-col gap-1">{[...cols.left, ...cols.right].map(pos => renderMember(pId, team, pos))}</div>
          ) : (
            <>
              <div className="flex flex-col gap-1">{cols.left.map(pos => renderMember(pId, team, pos))}</div>
              <div className="flex flex-col gap-1">{cols.right.map(pos => renderMember(pId, team, pos))}</div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-screen bg-[#090C0F] p-2 flex flex-col overflow-hidden text-white font-poppins">
      <style>{`
        @keyframes song-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        .animate-song-pulse { animation: song-pulse 10s ease-in-out infinite; }
        ::-webkit-scrollbar { display: none !important; }
        html, body { overflow: hidden; }
      `}</style>

      {/* COG WHEEL TOGGLE BUTTON */}
      {!hideControls && (
        <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="fixed top-4 right-4 z-[100] p-2 rounded-full bg-black/20 hover:bg-black/40 text-white/50 hover:text-white transition-all border border-white/10">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
        </button>
      )}

      {/* SETTINGS BAR */}
      <div className={`transition-all duration-500 overflow-hidden ${isSettingsOpen && !hideControls ? 'max-h-24 opacity-100 mb-2' : 'max-h-0 opacity-0 mb-0'}`}>
        <div className="flex items-center justify-between p-2 rounded bg-[#10313A] border border-[#225262]">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 relative"><Image src="/DARK_MODE_LOGO.png" alt="FBC" fill className="object-contain" /></div>
            <h2 className="text-xl font-black uppercase font-larken">Matrix</h2>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-black uppercase">
            {Object.keys(showTeams).map(t => (
              <label key={t} className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={(showTeams as any)[t]} onChange={() => setShowTeams((p: any) => ({ ...p, [t]: !(showTeams as any)[t] }))} className="accent-white" /> {t}</label>
            ))}
            <select value={serviceCount} onChange={(e) => setServiceCount(Number(e.target.value))} className="bg-black border border-white/20 p-1 rounded">
              {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} SERVICES</option>)}
            </select>
          </div>
        </div>
      </div>

      {isLoading ? <div className="flex-1 flex items-center justify-center font-black animate-pulse uppercase">Syncing...</div> : (
        <div className={`flex-1 grid gap-2 overflow-hidden ${!isSettingsOpen ? 'pt-2' : ''}`} style={{ gridTemplateColumns: showSpecials ? `repeat(${serviceCount}, 1fr) 0.5fr` : `repeat(${serviceCount}, 1fr)` }}>
          {plans.map((p) => (
            <div key={p.id} className="rounded border-2 border-[#225262]/40 bg-[#10313A]/30 flex flex-col h-full overflow-hidden shadow-lg">
              <div className={`p-2 border-b-2 flex justify-between items-center ${p.isComplete ? 'bg-[#10313A]' : 'bg-[#35E1E5] text-black'}`}>
                <h3 className="font-black font-larken text-xl uppercase tracking-tighter">{p.date}</h3>
                <ServiceCountdown targetTime={p.startTime} />
              </div>

              <div className="p-2 overflow-y-auto flex-1 flex flex-col no-scrollbar">
                <div className="bg-black/40 p-2 rounded border border-white/5 h-[340px] flex flex-col shrink-0 mb-3 overflow-hidden">
                  <span className="font-black text-sm block truncate text-white leading-tight">{p.title}</span>
                  <span className="text-[10px] font-bold text-slate-500 block mb-2 uppercase tracking-widest">{p.series}</span>
                  <div className="flex-1 overflow-y-auto no-scrollbar space-y-1 border-l-2 border-white/10 pl-2">
                    {renderGroupedSetlist(p.items)}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  {showTeams.vocalists && renderTeamSection(p.id, p.teams.vocalists, 'VOCALISTS', 'vocalists')}
                  {showTeams.rhythm && renderTeamSection(p.id, p.teams.rhythm, 'BAND', 'rhythm')}
                  {showTeams.tech && renderTeamSection(p.id, p.teams.tech, 'TECH', 'tech')}
                  {showTeams.safety && renderTeamSection(p.id, p.teams.safety, 'SAFETY', 'safety')}
                </div>

                <div className="mt-auto pt-4 space-y-2">
                  {p.declined.length > 0 && (
                    <div className="bg-red-900/20 p-2 rounded border border-red-500/30">
                      <span className="text-[13px] font-black text-red-500 block mb-1 uppercase tracking-widest">DECLINED</span>
                      {p.declined.map(d => (
                        <div key={d.id} className="text-[18px] line-through text-red-400 font-bold leading-none mb-1">
                          {formatName(d.name)} <span className="text-[14px] opacity-60">({d.position})</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {p.blockouts && p.blockouts.length > 0 && (
                    <div className="bg-slate-800/40 p-2 rounded border border-slate-700">
                      <span className="text-[13px] font-black text-slate-200 block mb-1 uppercase tracking-widest">BLOCKOUTS</span>
                      <div className="flex flex-wrap gap-1">
                        {p.blockouts.map(name => (
                          <span key={name} className="bg-slate-700 px-1.5 py-0.5 rounded text-[18px] font-bold opacity-60">
                            {formatName(name)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {showSpecials && (
            <div className="flex flex-col h-full gap-2">
              {specialPlans.map((sp: any, i: number) => (
                <div key={i} className="flex-1 flex flex-col p-2 rounded border-2 bg-[#10313A]/60 border-[#225262]/40">
                  <div className="flex justify-between items-baseline mb-2 border-b border-white/10 pb-1">
                    <h4 className="text-[15px] font-black uppercase text-slate-200 tracking-widest">{i === 0 ? "Choir Rehearsal" : "Student Choir"}</h4>
                    <span className="text-[18px] font-black text-[#35E1E5]">{sp?.date || 'TBD'}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1">
                    {!sp?.exists ? (
                      <div className="bg-[#E5B429] text-black p-2 rounded font-black text-[30px] text-center mt-4">NO PLAN</div>
                    ) : !sp?.items?.length ? (
                      <div className="bg-[#E5B429] text-black p-2 rounded font-black text-[30px] text-center mt-4 uppercase">Blank</div>
                    ) : (
                      sp.items.map((item: any, j: number) => (
                        item?.type === 'header' ? (
                          <div key={j} className="text-[12px] font-black text-[#E5B429] uppercase mt-3 mb-1 border-b border-white/10 pb-0.5 tracking-widest">
                            {item?.title || 'UNTITLED HEADER'}
                          </div>
                        ) : (
                          <div key={j} className="text-[12px] font-bold px-2 py-1 rounded border border-blue-900/30 bg-[#225262]/50 text-white truncate animate-song-pulse">
                            {item?.title ? item.title.toUpperCase() : 'UNTITLED'}
                          </div>
                        )
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

