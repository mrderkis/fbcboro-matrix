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

export interface SpecialPlanItem {
  title: string;
  type: string;
}

export interface SpecialPlan {
  id: number;
  exists: boolean;
  date: string;
  items: SpecialPlanItem[];
}

interface PCORawResponse<T, I = unknown> { data: T[]; included?: I[]; }
interface PCORawPlan { id: string; attributes: { dates: string | null; sort_date: string; title: string | null; series_title: string | null; }; relationships: { plan_times: { data: { id: string; type: string }[] } }; }
interface PCORawPlanTime { id: string; type: 'PlanTime'; attributes: { starts_at: string; time_type: string; }; }

interface PCORawItem { 
  id: string; 
  attributes: { title: string | null; item_type: string | null; description?: string | null; }; 
  relationships?: { item_assignments?: { data?: { id: string; type: string }[] } };
}

interface PCORawTeamMember { id: string; attributes: { status: 'C' | 'U' | 'D'; team_position_name: string | null; name: string | null; prepare_notification: boolean; }; relationships: { team?: { data?: { id: string } | null; } | null; person?: { data?: { id: string } | null; } | null; }; }
interface PCOBlockout { id: string; attributes: { starts_at: string; ends_at: string; group_identifier: string | null; reason: string | null; }; }
interface FormattedBlockout { id: string; personId: string; name: string; startsAt: string; endsAt: string; groupId: string | null; }

interface PCORawPerson {
  id: string;
  type?: string;
  attributes?: {
    name?: string | null;
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  };
}

interface PCOIncludedItem {
  id: string;
  type: string;
  attributes?: {
    name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  };
  relationships?: {
    assignable?: {
      data?: {
        id: string;
        type: string;
      } | null;
    };
  };
}

const SERVICE_TYPE_ID = '22562';
const TARGET_TEAMS = { 
  vocalists: '6390329', 
  rhythm: '2464005', 
  tech: '71878', 
  orchestra: '71876',
  safety: '4026892' 
};
const SETTINGS_PATH = path.join(process.cwd(), 'ignored-slots.json');

// --- SMART PCO FETCH WRAPPER ---
// Intercepts 429 Rate Limits AND local network drops (ENOTFOUND/Timeouts),
// automatically pausing and retrying without crashing the app.
async function pcoFetch(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
  try {
    const res = await fetch(url, options);

    if (res.status === 429 && retries > 0) {
      const retryAfter = res.headers.get('Retry-After');
      const waitSeconds = retryAfter ? parseInt(retryAfter, 10) : 20;
      console.warn(`[PCO API] Rate limit hit. Pausing execution for ${waitSeconds} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      return pcoFetch(url, options, retries - 1);
    }

    return res;
  } catch (error: unknown) {
    // If the network drops (ENOTFOUND, Timeout), use Exponential Backoff
    if (retries > 0) {
      // Retries will wait 2s, then 4s, then 6s
      const backoffTime = (4 - retries) * 2000; 
      console.warn(`[Network Glitch] Timeout/Drop. Retrying in ${backoffTime / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
      return pcoFetch(url, options, retries - 1);
    }
    // If we are completely out of retries, throw it to the outer safety nets
    throw error; 
  }
}

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
  const plansRes = await pcoFetch(`https://api.planningcenteronline.com/services/v2/service_types/${SERVICE_TYPE_ID}/plans?filter=future&per_page=${fetchCount}&include=plan_times`, { headers, next: { revalidate: 60 } });
  
  if (!plansRes.ok) throw new Error(`Failed to fetch PCO plans. Status: ${plansRes.status}`);

  const plansData = (await plansRes.json()) as PCORawResponse<PCORawPlan, PCORawPlanTime>;
  const includedTimes = plansData.included || [];
  
  const now = Date.now();
  const validPlans = plansData.data.filter(plan => {
    const pDate = new Date(plan.attributes.sort_date);
    const expirationTime = new Date(pDate.getFullYear(), pDate.getMonth(), pDate.getDate(), 13, 0, 0).getTime();
    return now < expirationTime;
  }).slice(0, count);

  const planDataCache: { plan: PCORawPlan, teamData: PCORawResponse<PCORawTeamMember>, itemsData: PCORawResponse<PCORawItem, PCOIncludedItem> }[] = [];
  const allPersonIds = new Set<string>();
  const personMap = new Map<string, string>();

  // PHASE 1: THE MASTER ROSTER FETCH (SEQUENTIAL)
  const rosterResults: PCORawPerson[][] = [];
  for (const teamId of Object.values(TARGET_TEAMS)) {
    try {
      const res = await pcoFetch(`https://api.planningcenteronline.com/services/v2/teams/${teamId}/people?per_page=100`, { headers, next: { revalidate: 60 } });
      if (res.ok) {
        const json = (await res.json()) as { data: PCORawPerson[] };
        rosterResults.push(json.data || []);
      }
    } catch { /* Ignore individual roster failures so the rest can continue */ }
  }
  
  rosterResults.flat().forEach((person: PCORawPerson) => {
    if (person && person.id) {
      const name = person.attributes?.name || person.attributes?.full_name || `${person.attributes?.first_name || ''} ${person.attributes?.last_name || ''}`.trim() || 'Unknown';
      allPersonIds.add(person.id);
      personMap.set(person.id, name);
    }
  });

  // PHASE 2: FETCH THE SPECIFIC PLAN DETAILS (SEQUENTIAL)
  for (const plan of validPlans) {
    const planId = plan.id;
    
    // Fetch one by one to protect local router socket limits
    const teamRes = await pcoFetch(`https://api.planningcenteronline.com/services/v2/service_types/${SERVICE_TYPE_ID}/plans/${planId}/team_members?include=team,person&per_page=100`, { headers, next: { revalidate: 60 } });
    const itemsRes = await pcoFetch(`https://api.planningcenteronline.com/services/v2/service_types/${SERVICE_TYPE_ID}/plans/${planId}/items?per_page=100&include=item_assignments,item_assignments.assignable`, { headers, next: { revalidate: 60 } });

    const teamData = (await teamRes.json()) as PCORawResponse<PCORawTeamMember>;
    const itemsData = (await itemsRes.json()) as PCORawResponse<PCORawItem, PCOIncludedItem>;

    teamData.data.forEach((member) => {
      const pid = member.relationships?.person?.data?.id;
      if (pid) { 
        allPersonIds.add(pid); 
        if (!personMap.has(pid) || personMap.get(pid) === 'Unknown') {
          personMap.set(pid, member.attributes.name || 'Unknown'); 
        }
      }
    });
    planDataCache.push({ plan, teamData, itemsData });
  }

  // PHASE 3: FETCH THE BLOCKOUTS (CHUNKED)
  const allBlockouts: FormattedBlockout[] = [];
  const uniqueIds = Array.from(allPersonIds);
  
  // Lowered chunk size to 5 to prevent UND_ERR_CONNECT_TIMEOUT bottlenecks
  const chunkSize = 5; 

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const promises = chunk.map(async (personId) => {
      try {
        const url = `https://api.planningcenteronline.com/services/v2/people/${personId}/blockouts?filter=future`;
        const res = await pcoFetch(url, { headers, next: { revalidate: 60 } });
        if (!res.ok) return [];
        const json = (await res.json()) as { data: PCOBlockout[] };
        return (json.data || []).map((b) => ({ 
          id: b.id, 
          personId: personId, 
          name: personMap.get(personId) || "Unknown", 
          startsAt: b.attributes.starts_at, 
          endsAt: b.attributes.ends_at, 
          groupId: b.attributes.group_identifier 
        }));
      } catch { return []; }
    });
    const results = await Promise.all(promises);
    results.forEach(resArray => allBlockouts.push(...resArray));
  }

  // PHASE 4: ASSEMBLE THE DASHBOARD PLANS
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

    const itemsIncluded = itemsData.included || [];
    const assignmentsMap = new Map<string, PCOIncludedItem>();
    const assignablePeopleMap = new Map<string, string>();

    itemsIncluded.forEach((inc: PCOIncludedItem) => {
      if (inc.type === 'ItemAssignment') {
        assignmentsMap.set(inc.id, inc);
      } else if (inc.type === 'Person') {
        const fullName = inc.attributes?.name || 
                         `${inc.attributes?.first_name || ''} ${inc.attributes?.last_name || ''}`.trim() || 
                         'Unknown';
        assignablePeopleMap.set(inc.id, fullName);
      }
    });

    const planItems: PlanItem[] = itemsData.data
      .map((item: PCORawItem) => {
        let songLeaderName: string | undefined = undefined;
        
        const assignmentRefs = item.relationships?.item_assignments?.data;
        if (Array.isArray(assignmentRefs) && assignmentRefs.length > 0) {
          const assignmentObj = assignmentsMap.get(assignmentRefs[0].id);
          
          if (assignmentObj && assignmentObj.relationships?.assignable?.data) {
            const assignableId = assignmentObj.relationships.assignable.data.id;
            songLeaderName = assignablePeopleMap.get(assignableId) || personMap.get(assignableId);
          }
        }

        if (!songLeaderName) {
           songLeaderName = item.attributes.description?.match(/Leader:\s*([^|,\n]+)/i)?.[1]?.trim() || undefined;
        }

        return { 
          id: item.id, 
          title: item.attributes.title || 'Untitled', 
          type: item.attributes.item_type || 'item',
          songLeader: songLeaderName 
        };
      })
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

    teamData.data.forEach((member: PCORawTeamMember) => {
      const teamId = member.relationships?.team?.data?.id;
      const status = member.attributes.status;
      
      const memberObj: TeamMember = { 
        id: member.id, 
        name: member.attributes.name || 'Unknown', 
        position: member.attributes.team_position_name || 'Unassigned', 
        status, 
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

export async function fetchSpecialPlans(): Promise<SpecialPlan[]> {
  const specialIds = [415926, 1464487]; 
  const headers = { 'Authorization': `Basic ${Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')}` };

  const results = await Promise.all(specialIds.map(async (id) => {
    try {
      const planRes = await pcoFetch(`https://api.planningcenteronline.com/services/v2/service_types/${id}/plans?filter=future&per_page=1`, { 
        headers, next: { revalidate: 60 } 
      });
      const planData = await planRes.json();
      
      if (!planData.data || planData.data.length === 0) return { id, exists: false, date: 'NO PLAN', items: [] };
      
      const plan = planData.data[0];
      const planId = plan.id;

      const itemsRes = await pcoFetch(`https://api.planningcenteronline.com/services/v2/service_types/${id}/plans/${planId}/items?per_page=100`, { 
        headers, next: { revalidate: 60 } 
      });
      const itemsData = await itemsRes.json();
      
      const rawItems = itemsData.data || [];
      
      const formattedItems = rawItems.map((i: PCORawItem) => ({
        title: i.attributes?.title || 'Untitled',
        type: i.attributes?.item_type || 'item' 
      }));

      return { 
        id, 
        date: new Date(plan.attributes.sort_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }), 
        items: formattedItems, 
        exists: true 
      };
    } catch (e) { 
      return { id, exists: false, date: 'ERROR', items: [] }; 
    }
  }));
  return results;
}