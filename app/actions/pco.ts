'use server'

import { promises as fs } from 'fs';
import path from 'path';

export interface TeamMember {
  id: string;
  name: string;
  position: string; 
  status: 'C' | 'U' | 'D'; 
  notificationsSent: boolean; 
}

export interface PlanItem {
  id: string;
  title: string;
  type: string;
  songLeader?: string; 
}

export interface TeamCategory {
  id: string;
  name: string;
  members: TeamMember[];
  isEmpty: boolean;
}

export interface DashboardPlan {
  id: string;
  date: string;
  startTime: string | null;
  title: string;
  series: string;
  isComplete: boolean;
  items: PlanItem[];
  declined: TeamMember[];
  blockouts?: string[];
  teams: {
    vocalists: TeamCategory;
    rhythm: TeamCategory;
    tech: TeamCategory;
    orchestra: TeamCategory;
    safety: TeamCategory; 
  };
}

interface PCORawResponse<T, I = unknown> { data: T[]; included?: I[]; }
interface PCORawPlan { id: string; attributes: { dates: string | null; sort_date: string; title: string | null; series_title: string | null; }; relationships: { plan_times: { data: { id: string; type: string }[] } }; }
interface PCORawPlanTime { id: string; type: 'PlanTime'; attributes: { starts_at: string; time_type: string; }; }
interface PCORawItem { id: string; attributes: { title: string | null; item_type: string | null; description?: string | null; }; }
interface PCORawTeamMember { id: string; attributes: { status: 'C' | 'U' | 'D'; team_position_name: string | null; name: string | null; prepare_notification: boolean; }; relationships: { team?: { data?: { id: string } | null; } | null; person?: { data?: { id: string } | null; } | null; }; }
interface PCOBlockout { id: string; attributes: { starts_at: string; ends_at: string; group_identifier: string | null; reason: string | null; }; }
interface FormattedBlockout { id: string; personId: string; name: string; startsAt: string; endsAt: string; groupId: string | null; }

const SERVICE_TYPE_ID = '22562';
const TARGET_TEAMS = { 
  vocalists: '6390329', 
  rhythm: '2464005', 
  tech: '71878', 
  orchestra: '71876',
  safety: '4026892' 
};
const SETTINGS_PATH = path.join(process.cwd(), 'ignored-slots.json');

export async function getIgnoredSettings(): Promise<Record<string, boolean>> {
  try { const data = await fs.readFile(SETTINGS_PATH, 'utf8'); return JSON.parse(data) as Record<string, boolean>; } 
  catch { return {}; }
}

export async function toggleIgnoredSetting(planId: string, position: string): Promise<Record<string, boolean>> {
  const current = await getIgnoredSettings();
  const key = `${planId}-${position}`;
  if (current[key]) delete current[key]; else current[key] = true;
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(current, null, 2));
  return current;
}

export async function fetchMatrixPlans(count: number): Promise<DashboardPlan[]> {
  const appId = process.env.PCO_APP_ID;
  const secret = process.env.PCO_SECRET;
  if (!appId || !secret) throw new Error("Missing PCO Credentials");

  const authHeader = `Basic ${Buffer.from(`${appId}:${secret}`).toString('base64')}`;
  const headers: Record<string, string> = { Authorization: authHeader };

  const fetchCount = count + 2; 
  const plansRes = await fetch(`https://api.planningcenteronline.com/services/v2/service_types/${SERVICE_TYPE_ID}/plans?filter=future&per_page=${fetchCount}&include=plan_times`, { headers, next: { revalidate: 0 } });
  
  if (!plansRes.ok) throw new Error(`Failed to fetch PCO plans. Status: ${plansRes.status}`);

  const plansData = (await plansRes.json()) as PCORawResponse<PCORawPlan, PCORawPlanTime>;
  const includedTimes = plansData.included || [];
  
  const now = Date.now();
  const validPlans = plansData.data.filter(plan => {
    const pDate = new Date(plan.attributes.sort_date);
    const expirationTime = new Date(pDate.getFullYear(), pDate.getMonth(), pDate.getDate(), 13, 0, 0).getTime();
    return now < expirationTime;
  }).slice(0, count);

  const planDataCache: { plan: PCORawPlan, teamData: PCORawResponse<PCORawTeamMember>, itemsData: PCORawResponse<PCORawItem> }[] = [];
  const allPersonIds = new Set<string>();
  const personMap = new Map<string, string>();

  for (const plan of validPlans) {
    const planId = plan.id;
    const [teamRes, itemsRes] = await Promise.all([
      fetch(`https://api.planningcenteronline.com/services/v2/service_types/${SERVICE_TYPE_ID}/plans/${planId}/team_members?include=team,person&per_page=100`, { headers }),
      fetch(`https://api.planningcenteronline.com/services/v2/service_types/${SERVICE_TYPE_ID}/plans/${planId}/items?per_page=100`, { headers })
    ]);

    const teamData = (await teamRes.json()) as PCORawResponse<PCORawTeamMember>;
    const itemsData = (await itemsRes.json()) as PCORawResponse<PCORawItem>;

    teamData.data.forEach((member) => {
      const pid = member.relationships?.person?.data?.id;
      if (pid) { allPersonIds.add(pid); personMap.set(pid, member.attributes.name || 'Unknown'); }
    });
    planDataCache.push({ plan, teamData, itemsData });
  }

  const allBlockouts: FormattedBlockout[] = [];
  const uniqueIds = Array.from(allPersonIds);
  const chunkSize = 20;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const promises = chunk.map(async (personId) => {
      try {
        const url = `https://api.planningcenteronline.com/services/v2/people/${personId}/blockouts?filter=future`;
        const res = await fetch(url, { headers, next: { revalidate: 60 } });
        if (!res.ok) return [];
        const json = (await res.json()) as { data: PCOBlockout[] };
        return (json.data || []).map((b) => ({ id: b.id, personId: personId, name: personMap.get(personId) || "Unknown", startsAt: b.attributes.starts_at, endsAt: b.attributes.ends_at, groupId: b.attributes.group_identifier }));
      } catch { return []; }
    });
    const results = await Promise.all(promises);
    results.forEach(resArray => allBlockouts.push(...resArray));
  }

  const dashboardPlans: DashboardPlan[] = [];

  for (const cached of planDataCache) {
    const { plan, teamData, itemsData } = cached;
    const pDateStr = plan.attributes.sort_date.split('T')[0]; 
    const planTime = new Date(`${pDateStr}T00:00:00Z`).getTime();
    
    const serviceTimes = includedTimes
      .filter(i => i.type === 'PlanTime' && i.attributes.time_type === 'service')
      .filter(i => plan.relationships.plan_times.data.some(ptr => ptr.id === i.id))
      .sort((a, b) => new Date(a.attributes.starts_at).getTime() - new Date(b.attributes.starts_at).getTime());

    const startTime = serviceTimes.length > 0 ? serviceTimes[0].attributes.starts_at : null;

    const planItems: PlanItem[] = itemsData.data
      .map(item => ({ 
        id: item.id, 
        title: item.attributes.title || 'Untitled', 
        type: item.attributes.item_type || 'item',
        songLeader: item.attributes.description?.match(/Leader:\s*([^|,\n]+)/i)?.[1]?.trim() || undefined 
      }))
      .filter(i => i.type !== 'header');

    const teams = {
      vocalists: { id: TARGET_TEAMS.vocalists, name: 'Vocalists', members: [] as TeamMember[], isEmpty: true },
      rhythm: { id: TARGET_TEAMS.rhythm, name: 'Rhythm', members: [] as TeamMember[], isEmpty: true },
      tech: { id: TARGET_TEAMS.tech, name: 'Tech', members: [] as TeamMember[], isEmpty: true },
      orchestra: { id: TARGET_TEAMS.orchestra, name: 'Orchestra', members: [] as TeamMember[], isEmpty: true },
      safety: { id: TARGET_TEAMS.safety, name: 'Safety', members: [] as TeamMember[], isEmpty: true }, 
    };

    const declined: TeamMember[] = [];
    let hasUnconfirmed = false;
    let safetyCounter = 1;

    teamData.data.forEach(member => {
      const teamId = member.relationships?.team?.data?.id;
      const status = member.attributes.status;
      
      const memberObj: TeamMember = { 
        id: member.id, 
        name: member.attributes.name || 'Unknown', 
        position: member.attributes.team_position_name || 'Unassigned', 
        status, 
        // THE FIX: If PCO says 'prepare_notification' is false, it means the email WAS sent.
        notificationsSent: member.attributes.prepare_notification === false
      };

      if (status === 'D') declined.push(memberObj);
      else {
        if (status === 'U') hasUnconfirmed = true;
        if (teamId === TARGET_TEAMS.vocalists) teams.vocalists.members.push(memberObj);
        else if (teamId === TARGET_TEAMS.rhythm) teams.rhythm.members.push(memberObj);
        else if (teamId === TARGET_TEAMS.tech) teams.tech.members.push(memberObj);
        else if (teamId === TARGET_TEAMS.orchestra) teams.orchestra.members.push(memberObj);
        else if (teamId === TARGET_TEAMS.safety) {
          memberObj.position = `S${safetyCounter}`;
          safetyCounter++;
          teams.safety.members.push(memberObj); 
        }
      }
    });

    (Object.keys(teams) as Array<keyof typeof teams>).forEach(k => { teams[k].isEmpty = teams[k].members.length === 0; });

    const uniqueBlockoutNames = new Set<string>();
    const seenGroups = new Set<string>();

    allBlockouts.forEach(block => {
      const bStartStr = block.startsAt.split('T')[0];
      const bEndStr = block.endsAt.split('T')[0];
      const bStartTime = new Date(`${bStartStr}T00:00:00Z`).getTime();
      const bEndTime = new Date(`${bEndStr}T00:00:00Z`).getTime();
      if (planTime >= bStartTime && planTime <= bEndTime) {
        if (block.groupId && seenGroups.has(block.groupId)) return;
        uniqueBlockoutNames.add(block.name);
        if (block.groupId) seenGroups.add(block.groupId);
      }
    });

    dashboardPlans.push({
      id: plan.id, date: plan.attributes.dates || 'TBD', startTime, title: plan.attributes.title || 'Regular Service',
      series: plan.attributes.series_title || '', isComplete: !hasUnconfirmed, items: planItems, declined,
      blockouts: Array.from(uniqueBlockoutNames).sort(), teams
    });
  }
  
  return dashboardPlans;
}

export async function fetchSpecialPlans() {
  const specialIds = [415926, 1464487]; 
  const results = await Promise.all(specialIds.map(async (id) => {
    try {
      const response = await fetch(`https://api.planningcenteronline.com/services/v2/service_types/${id}/plans?filter=future&per_page=1&include=items`, { headers: { 'Authorization': `Basic ${Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')}` }, next: { revalidate: 300 } });
      const data = await response.json();
      if (!data.data || data.data.length === 0) return { id, error: 'no plan created' };
      const plan = data.data[0];
      const items = data.included || [];
      const songs = items.filter((i: any) => i.attributes.item_type === 'song');
      return { id, date: new Date(plan.attributes.sort_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }), songs: songs.map((s: any) => s.attributes.title), exists: true };
    } catch (e) { return { id, error: 'connection error' }; }
  }));
  return results;
}