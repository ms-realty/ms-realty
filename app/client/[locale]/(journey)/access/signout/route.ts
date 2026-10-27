import { clientInputClearCookie } from "@/server/auth/client-input";
import { signOutRoute } from "@/server/auth/signout";

const signOut = signOutRoute("client");
export async function POST(request: Request, context: { params: Promise<{ locale: string }> }) {
  const response = await signOut(request, context);
  if (response.status === 303) response.headers.append("set-cookie", clientInputClearCookie());
  return response;
}
