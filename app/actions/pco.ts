'use server'

import { promises as fs } from 'fs';
import path from 'path';

/**
 * EXPORTED DATA INTERFACES
 */
export interface TeamMember {
  id: string;
  name: string;
  position: string; 
  status: 'C' | 'U' | 'D'; 
}

export interface PlanItem {
  id: string;
  title: string;
  type: string;
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
  teams: {
    vocalists: TeamCategory;
    rhythm: TeamCategory;
    tech: TeamCategory;
    orchestra: TeamCategory;
  };
}

/**
 * INTERNAL PCO API INTERFACES
 */
interface PCORawResponse<T, I = unknown> { 
  data: T[]; 
  included?: I[]; 
}

interface PCORawPlan { 
  id: string; 
  attributes: { 
    dates: string | null; 
    title: string | null; 
    series_title: string | null; 
  }; 
  relationships: { 
    plan_times: { data: { id: string; type: string }[] } 
  }; 
}

interface PCORawPlanTime {
  id: string;
  type: 'PlanTime';
  attributes: { 
    starts_at: string; 
    time_type: string; 
  };
}

interface PCORawItem { 
  id: string; 
  attributes: { 
    title: string | null; 
    item_type: string | null; 
  }; 
}

interface PCORawTeamMember { 
  id: string; 
  attributes: { 
    status: 'C' | 'U' | 'D'; 
    team_position_name: string | null; 
    name: string | null; 
  }; 
  relationships: { 
    team: { data: { id: string } | null; } | null; 
  }; 
}

const SERVICE_TYPE_ID = '22562';
const TARGET_TEAMS = { 
  vocalists: '6390329', 
  rhythm: '2464005', 
  tech: '71878', 
  orchestra: '71876' 
};
const SETTINGS_PATH = path.join(process.cwd(), 'ignored-slots.json');

/**
 * SERVER ACTIONS
 */
export async function getIgnoredSettings(): Promise<Record<string, boolean>> {
  try { 
    const data = await fs.readFile(SETTINGS_PATH, 'utf8'); 
    return JSON.parse(data) as Record<string, boolean>; 
  } catch { 
    return {}; 
  }
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
  const headers = { Authorization: authHeader };

  const plansRes = await fetch(
    `https://api.planningcenteronline.com/services/v2/service_types/${SERVICE_TYPE_ID}/plans?filter=future&per_page=${count}&include=plan_times`, 
    { headers, next: { revalidate: 0 } }
  );
  
  const plansData = (await plansRes.json()) as PCORawResponse<PCORawPlan, PCORawPlanTime>;
  const includedTimes = plansData.included || [];
  const dashboardPlans: DashboardPlan[] = [];

  for (const plan of plansData.data) {
    const planId = plan.id;
    
    // Extract earliest service time
    const serviceTimes = includedTimes
      .filter(i => i.type === 'PlanTime' && i.attributes.time_type === 'service')
      .filter(i => plan.relationships.plan_times.data.some(ptr => ptr.id === i.id))
      .sort((a, b) => new Date(a.attributes.starts_at).getTime() - new Date(b.attributes.starts_at).getTime());

    const startTime = serviceTimes.length > 0 ? serviceTimes[0].attributes.starts_at : null;

    const [teamRes, itemsRes] = await Promise.all([
      fetch(`https://api.planningcenteronline.com/services/v2/service_types/${SERVICE_TYPE_ID}/plans/${planId}/team_members?include=team,person&per_page=100`, { headers }),
      fetch(`https://api.planningcenteronline.com/services/v2/service_types/${SERVICE_TYPE_ID}/plans/${planId}/items?per_page=100`, { headers })
    ]);

    const teamData = (await teamRes.json()) as PCORawResponse<PCORawTeamMember>;
    const itemsData = (await itemsRes.json()) as PCORawResponse<PCORawItem>;

    const planItems: PlanItem[] = itemsData.data
      .map(item => ({ 
        id: item.id, 
        title: item.attributes.title || 'Untitled', 
        type: item.attributes.item_type || 'item' 
      }))
      .filter(i => i.type !== 'header');

    const teams = {
      vocalists: { id: TARGET_TEAMS.vocalists, name: 'Vocalists', members: [] as TeamMember[], isEmpty: true },
      rhythm: { id: TARGET_TEAMS.rhythm, name: 'Rhythm', members: [] as TeamMember[], isEmpty: true },
      tech: { id: TARGET_TEAMS.tech, name: 'Tech', members: [] as TeamMember[], isEmpty: true },
      orchestra: { id: TARGET_TEAMS.orchestra, name: 'Orchestra', members: [] as TeamMember[], isEmpty: true },
    };

    const declined: TeamMember[] = [];
    let hasUnconfirmed = false;

    teamData.data.forEach(member => {
      const teamId = member.relationships?.team?.data?.id;
      const status = member.attributes.status;
      const memberObj: TeamMember = { 
        id: member.id, 
        name: member.attributes.name || 'Unknown', 
        position: member.attributes.team_position_name || 'Unassigned', 
        status 
      };

      if (status === 'D') declined.push(memberObj);
      else {
        if (status === 'U') hasUnconfirmed = true;
        if (teamId === TARGET_TEAMS.vocalists) teams.vocalists.members.push(memberObj);
        else if (teamId === TARGET_TEAMS.rhythm) teams.rhythm.members.push(memberObj);
        else if (teamId === TARGET_TEAMS.tech) teams.tech.members.push(memberObj);
        else if (teamId === TARGET_TEAMS.orchestra) teams.orchestra.members.push(memberObj);
      }
    });

    (Object.keys(teams) as Array<keyof typeof teams>).forEach(k => { 
      teams[k].isEmpty = teams[k].members.length === 0; 
    });

    dashboardPlans.push({
      id: planId,
      date: plan.attributes.dates || 'TBD',
      startTime,
      title: plan.attributes.title || 'Regular Service',
      series: plan.attributes.series_title || '',
      isComplete: !hasUnconfirmed,
      items: planItems,
      declined,
      teams
    });
  }
  return dashboardPlans;
}