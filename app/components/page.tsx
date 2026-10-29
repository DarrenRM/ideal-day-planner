import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVITY_RECIPES, CATALOG_VERSION, COMPONENT_CATALOG } from "../../bridge/component-catalog.mjs";
import { ACTIVITY_CHOICE_SETS, ACTIVITY_LIBRARY, ACTIVITY_LIBRARY_VERSION } from "../../bridge/activity-library.mjs";
import { VERCEL_GATEWAY_PRINCIPAL_HEADER } from "../request-principal-model";
import { getChatGPTUser } from "../chatgpt-auth";
import { ComponentLibraryPage } from "./component-library-page";
import { COMPONENT_SPECIMENS, type LibraryComponentType } from "./component-library-fixtures";
import { readComponentUsage, type ComponentUsageMap } from "./component-usage";
import { localDateInTimeZone } from "../schedule-model";
import { FALLBACK_TIME_ZONE } from "../time-zone";
import { userTimeZone } from "../api/user-time-zone";

export const metadata: Metadata = {
  title: "Ideal Day libraries",
  description: "A living workbench for Ideal Day activities, components, and composition rules.",
};

// The catalog is rendered on the server, so "today" comes from the signed-in
// person's stored zone.
async function catalogDateKey(userId: string | undefined) {
  if (!userId) return localDateInTimeZone(new Date(), FALLBACK_TIME_ZONE);
  try { return localDateInTimeZone(new Date(), await userTimeZone(userId)); }
  catch { return localDateInTimeZone(new Date(), FALLBACK_TIME_ZONE); }
}

type ComponentsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ComponentsPage({ searchParams }: ComponentsPageProps) {
  const requestHeaders = await headers();
  if (requestHeaders.get(VERCEL_GATEWAY_PRINCIPAL_HEADER)) redirect("/");
  const user = await getChatGPTUser();
  let usage: ComponentUsageMap = {};
  if (user) {
    try { usage = await readComponentUsage(user.userId); }
    catch (error) { console.error("Unable to load component usage", error); }
  }
  const requestedComponent = (await searchParams)?.component;
  const initialSelectedType = typeof requestedComponent === "string" && COMPONENT_SPECIMENS.some((entry) => entry.type === requestedComponent)
    ? requestedComponent as LibraryComponentType
    : "summary";

  return <ComponentLibraryPage
    catalog={COMPONENT_CATALOG.map(([type, purpose, schema]) => ({ type, purpose, schema }))}
    catalogVersion={CATALOG_VERSION}
    recipes={[...ACTIVITY_RECIPES]}
    activities={ACTIVITY_LIBRARY.map((activity) => ({ ...activity, aliases: [...activity.aliases], components: { starting: [...activity.components.starting], optional: [...activity.components.optional] }, setup: { ...activity.setup }, onboarding: { ...activity.onboarding, priorities: [...activity.onboarding.priorities], rhythms: [...activity.onboarding.rhythms] } }))}
    activityChoiceSets={ACTIVITY_CHOICE_SETS}
    activityLibraryVersion={ACTIVITY_LIBRARY_VERSION}
    today={await catalogDateKey(user?.userId)}
    usage={usage}
    initialSelectedType={initialSelectedType}
  />;
}
