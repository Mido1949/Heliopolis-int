import { redirect } from "next/navigation";

// Keep ?leadId= so a quote started from a lead is attached to that lead; the
// old bare redirect dropped it and the editor created a duplicate lead.
export default function BOQIndexPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const leadId = typeof searchParams.leadId === "string" ? searchParams.leadId : null;
  redirect(leadId ? `/boq/new?leadId=${encodeURIComponent(leadId)}` : "/boq/new");
}
