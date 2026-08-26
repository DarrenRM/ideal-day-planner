import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVITY_RECIPES, CATALOG_VERSION, COMPONENT_CATALOG } from "../../bridge/component-catalog.mjs";
import { VERCEL_GATEWAY_PRINCIPAL_HEADER } from "../request-principal-model";
import { getChatGPTUser } from "../chatgpt-auth";
import { ComponentLibraryPage } from "./component-library-page";
import { readComponentUsage, type ComponentUsageMap } from "./component-usage";

export const metadata: Metadata = {
  title: "Component library · Ideal Day",
  description: "A living workbench for Ideal Day activity components and composition rules.",
};

function phoenixDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export default async function ComponentsPage() {
  const requestHeaders = await headers();
  if (requestHeaders.get(VERCEL_GATEWAY_PRINCIPAL_HEADER)) redirect("/");
  const user = await getChatGPTUser();
  let usage: ComponentUsageMap = {};
  if (user) {
    try { usage = await readComponentUsage(user.userId); }
    catch (error) { console.error("Unable to load component usage", error); }
  }

  return <ComponentLibraryPage
    catalog={COMPONENT_CATALOG.map(([type, purpose, schema]) => ({ type, purpose, schema }))}
    catalogVersion={CATALOG_VERSION}
    recipes={[...ACTIVITY_RECIPES]}
    today={phoenixDateKey()}
    usage={usage}
  />;
}
