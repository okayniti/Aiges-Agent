import { redirect } from "next/navigation";

// The console is one continuous page now. This route existed when Fleet, Policy
// and Audit were separate tabs; it stays as a redirect so older links do not 404.
export default function FleetRedirect() {
  redirect("/");
}
