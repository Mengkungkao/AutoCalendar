import { NextResponse, type NextRequest } from "next/server";
import { readDownload } from "@/lib/download";
import { buildCalendar } from "@/lib/ics";
import { planShift } from "@/lib/plan";
import { isSignedIn } from "@/server/auth";

// Writes the calendar file for the shifts in the link (see lib/download.ts).
// Nothing is stored: the link carries everything the file needs.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  if (!(await isSignedIn(request.cookies))) {
    return new NextResponse("Sign in to AutoCalendar first.", { status: 401 });
  }
  const { file } = await params;
  const payload = readDownload(request.nextUrl.searchParams.get("d"));
  if (!payload) {
    return new NextResponse("This download link is broken. Go back and tap the download button again.", { status: 400 });
  }
  const fileName = /^[a-z0-9][a-z0-9-]{0,80}\.ics$/.test(file) ? file : "shifts.ics";
  const shifts = payload.shifts.map((shift) => planShift(shift, payload.settings));
  return new NextResponse(buildCalendar(shifts, Date.now()), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // inline: iPhone Safari shows the events with "Add All" instead of saving a file.
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
