'use server'

import { promises as fs } from 'fs';
import path from 'path';
import { revalidatePath } from 'next/cache'; // <-- THE MAGIC HAMMER

export interface DisplaySettings {
  name: string; 
  slug: string; 
  serviceCount: number;
  showSpecials: boolean;
  teams: {
    vocalists: boolean;
    rhythm: boolean;
    tech: boolean;
    safety: boolean;
    orchestra: boolean;
  };
}

// This tells TypeScript that our file is an object with string keys
export type DisplayConfig = Record<string, DisplaySettings>;

const CONFIG_PATH = path.join(process.cwd(), 'displays.json');

async function ensureConfigExists(): Promise<void> {
  try {
    await fs.access(CONFIG_PATH);
  } catch {
    const defaultData: DisplayConfig = {
      "PRODUCTION": {
        name: 'Production Booth',
        slug: 'production',
        serviceCount: 4,
        showSpecials: true,
        teams: { vocalists: true, rhythm: true, tech: true, safety: true, orchestra: false }
      },
      "WORSHIP": {
        name: 'Worship Green Room',
        slug: 'worship',
        serviceCount: 4,
        showSpecials: true,
        teams: { vocalists: true, rhythm: true, tech: false, safety: false, orchestra: true }
      },
      "BROADCAST": {
        name: 'Broadcast Control',
        slug: 'broadcast',
        serviceCount: 4,
        showSpecials: false,
        teams: { vocalists: false, rhythm: false, tech: true, safety: false, orchestra: false }
      }
    };
    await fs.writeFile(CONFIG_PATH, JSON.stringify(defaultData, null, 2));
  }
}

export async function getDisplaySettings(): Promise<DisplayConfig> {
  await ensureConfigExists();
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(data) as DisplayConfig;
  } catch {
    return {};
  }
}

export async function saveDisplaySettings(settings: DisplayConfig): Promise<boolean> {
  try {
    // 1. Write the new settings to the physical file
    await fs.writeFile(CONFIG_PATH, JSON.stringify(settings, null, 2));
    
    // 2. FORCE NEXT.JS TO DUMP ITS CACHE
    // This tells the server to completely refresh all pages that use this data
    revalidatePath('/', 'layout'); 
    
    return true;
  } catch (e) {
    console.error("Failed to save settings", e);
    return false;
  }
}