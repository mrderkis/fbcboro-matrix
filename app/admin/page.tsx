'use client'

import { useState, useEffect } from 'react';
import { getDisplaySettings, saveDisplaySettings, DisplaySettings, DisplayConfig } from '../actions/settings';
import Link from 'next/link';

export default function AdminPage() {
  const [config, setConfig] = useState<DisplayConfig>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      const data = await getDisplaySettings();
      setConfig(data);
      setIsLoading(false);
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    await saveDisplaySettings(config);
    setTimeout(() => setIsSaving(false), 800); 
  };

  const handleAddNew = () => {
    if (!newName.trim() || !newSlug.trim()) {
      alert("Please enter a name and a URL path.");
      return;
    }
    
    const safeSlug = newSlug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const objectKey = safeSlug.toUpperCase();

    const newDisplay: DisplaySettings = {
      name: newName,
      slug: safeSlug,
      serviceCount: 4,
      showSpecials: true,
      teams: { vocalists: true, rhythm: true, tech: true, safety: true, orchestra: false }
    };
    
    // Add the new object directly into the JSON dictionary
    setConfig({
      [objectKey]: newDisplay,
      ...config
    });
    
    setNewName('');
    setNewSlug('');
  };

  const removeDisplay = (key: string) => {
    const updatedConfig = { ...config };
    delete updatedConfig[key];
    setConfig(updatedConfig);
  };

  const updateDisplay = (key: string, updates: Partial<DisplaySettings>) => {
    setConfig({
      ...config,
      [key]: { ...config[key], ...updates }
    });
  };

  const updateTeam = (key: string, teamKey: keyof DisplaySettings['teams'], value: boolean) => {
    setConfig({
      ...config,
      [key]: { 
        ...config[key], 
        teams: { ...config[key].teams, [teamKey]: value } 
      }
    });
  };

  if (isLoading) return <div className="min-h-screen bg-[#090C0F] text-white flex items-center justify-center font-black uppercase tracking-widest">Loading Command Center...</div>;

  // Convert the object into an array just so React can loop over it to draw the UI
  const displayEntries = Object.entries(config);

  return (
    <div className="min-h-screen bg-[#090C0F] text-white p-8 font-poppins">
      <div className="max-w-4xl mx-auto">
        
        {/* HEADER */}
        <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-4">
          <div>
            <h1 className="text-3xl font-black uppercase text-[#35E1E5] font-larken tracking-widest">Command Center</h1>
            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mt-1">Manage Dashboard Destinations</p>
          </div>
          <div>
            <button onClick={handleSave} disabled={isSaving} className={`px-8 py-3 rounded font-black uppercase text-sm transition-all shadow-lg ${isSaving ? 'bg-green-500 text-black shadow-green-500/20' : 'bg-[#E5B429] hover:bg-yellow-300 text-black shadow-[#E5B429]/20'}`}>
              {isSaving ? 'Saved!' : 'Save All Changes'}
            </button>
          </div>
        </div>

        {/* SECTION 1: ADD NEW DESTINATION */}
        <div className="bg-[#225262]/20 border-2 border-[#35E1E5]/30 rounded p-6 mb-12 shadow-lg">
          <h2 className="text-lg font-black uppercase text-[#35E1E5] mb-4 tracking-widest">Create New Destination</h2>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block tracking-widest">Destination Name</label>
              <input 
                type="text" 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-white font-bold outline-none focus:border-[#35E1E5] transition-colors"
                placeholder="e.g., Lobby TV"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block tracking-widest">URL Path (JSON Key)</label>
              <div className="flex items-center">
                <span className="bg-black/80 border border-r-0 border-white/20 rounded-l px-3 py-2 text-slate-500 font-bold">/</span>
                <input 
                  type="text" 
                  value={newSlug} 
                  onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="w-full bg-black/50 border border-white/20 rounded-r px-3 py-2 text-white font-bold outline-none focus:border-[#35E1E5] transition-colors"
                  placeholder="lobby"
                />
              </div>
            </div>
            <button onClick={handleAddNew} className="px-6 py-2 bg-[#35E1E5] hover:bg-white text-black font-black uppercase text-[13px] rounded h-[42px] transition-colors">
              Add to List
            </button>
          </div>
        </div>

        {/* SECTION 2: EDIT EXISTING DESTINATIONS */}
        <div className="space-y-4">
          <h2 className="text-lg font-black uppercase text-slate-400 mb-2 tracking-widest border-b border-white/10 pb-2">Existing Destinations</h2>
          
          {displayEntries.length === 0 && (
             <div className="text-center p-12 border-2 border-dashed border-white/20 rounded text-slate-500 font-black uppercase">No destinations configured.</div>
          )}
          
          {displayEntries.map(([key, display]) => (
            <div key={key} className="bg-[#10313A] border border-[#225262] rounded p-4 flex flex-col gap-4 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-black/40 px-3 py-1 rounded-bl text-[10px] font-black text-slate-500 tracking-widest">
                JSON KEY: {key}
              </div>
              
              <div className="flex gap-4 items-end mt-2">
                <div className="flex-1">
                  <label className="text-[10px] font-black uppercase text-[#35E1E5] mb-1 block tracking-widest">Destination Name</label>
                  <input 
                    type="text" 
                    value={display.name} 
                    onChange={(e) => updateDisplay(key, { name: e.target.value })}
                    className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-white font-bold outline-none focus:border-[#35E1E5] transition-colors"
                  />
                </div>

                <div className="flex-1">
                  <label className="text-[10px] font-black uppercase text-[#E5B429] mb-1 block tracking-widest">URL Path</label>
                  <div className="flex items-center">
                    <span className="bg-black/80 border border-r-0 border-white/20 rounded-l px-3 py-2 text-slate-500 font-bold">/</span>
                    <input 
                      type="text" 
                      value={display.slug} 
                      onChange={(e) => {
                        const safeSlug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                        updateDisplay(key, { slug: safeSlug });
                      }}
                      className="w-full bg-black/50 border border-white/20 rounded-r px-3 py-2 text-white font-bold outline-none focus:border-[#E5B429] transition-colors"
                    />
                  </div>
                </div>
                
                <div className="w-36">
                  <label className="text-[10px] font-black uppercase text-[#35E1E5] mb-1 block tracking-widest">Services</label>
                  <select 
                    value={display.serviceCount} 
                    onChange={(e) => updateDisplay(key, { serviceCount: Number(e.target.value) })}
                    className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-white font-bold outline-none focus:border-[#35E1E5]"
                  >
                    {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} Services</option>)}
                  </select>
                </div>

                <Link href={`/${display.slug}`} target="_blank" className="px-4 py-2 bg-blue-900/40 hover:bg-blue-600 border border-blue-500/50 rounded text-white font-black uppercase text-[12px] h-[42px] transition-colors flex items-center justify-center">
                  Preview
                </Link>

                <button onClick={() => removeDisplay(key)} className="px-4 py-2 bg-red-900/40 hover:bg-red-600 border border-red-500/50 rounded text-white font-black uppercase text-[12px] h-[42px] transition-colors">
                  Delete
                </button>
              </div>

              <div className="bg-black/30 rounded p-3 border border-white/5 flex flex-wrap gap-x-6 gap-y-3">
                <div className="w-full text-[10px] font-black uppercase text-slate-500 tracking-widest border-b border-white/10 pb-1 mb-1">Visible Components</div>
                
                {(Object.keys(display.teams) as Array<keyof DisplaySettings['teams']>).map(team => (
                  <label key={team} className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={display.teams[team]} 
                      onChange={(e) => updateTeam(key, team, e.target.checked)}
                      className="w-4 h-4 accent-[#E5B429] cursor-pointer"
                    />
                    <span className={`font-bold uppercase text-sm transition-colors ${display.teams[team] ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>
                      {team}
                    </span>
                  </label>
                ))}

                <div className="w-[1px] h-6 bg-white/20 mx-2 hidden sm:block"></div>

                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={display.showSpecials} 
                    onChange={(e) => updateDisplay(key, { showSpecials: e.target.checked })}
                    className="w-4 h-4 accent-[#35E1E5] cursor-pointer"
                  />
                  <span className={`font-bold uppercase text-sm transition-colors ${display.showSpecials ? 'text-[#35E1E5]' : 'text-slate-500 group-hover:text-slate-300'}`}>
                    Choir / Specials
                  </span>
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}