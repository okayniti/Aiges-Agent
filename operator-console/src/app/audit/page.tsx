import { redirect } from "next/navigation";

// See fleet/page.tsx — kept as a redirect now the console is a single page.
export default function AuditRedirect() {
  redirect("/");
}
