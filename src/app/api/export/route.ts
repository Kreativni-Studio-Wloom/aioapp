import { userFromRequest } from "@/lib/auth";
import { isoDate } from "@/lib/format";
import { exportUserData } from "@/lib/export";

export async function GET(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const data = { user: { email: user.email, name: user.name }, ...(await exportUserData(user.id)) };
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="aio-export-${isoDate()}.json"`,
    },
  });
}
