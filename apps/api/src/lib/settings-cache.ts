import { db } from "../db";

let kuberfyDomain: string | null | undefined;

export async function getCachedKuberfyDomain(): Promise<string | null> {
  if (kuberfyDomain === undefined) {
    const row = await db.query.setting.findFirst();
    kuberfyDomain = row?.kuberfyDomain ?? null;
  }
  return kuberfyDomain;
}

export function setCachedKuberfyDomain(domain: string | null) {
  kuberfyDomain = domain;
}
