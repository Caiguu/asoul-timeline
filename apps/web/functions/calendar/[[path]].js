export async function onRequest(context) {
  const { pathname } = new URL(context.request.url);
  if (pathname === "/calendar/asoul_schedule.ics") {
    const res = await fetch("https://asoul-timeline-api.caiguu.workers.dev/api/calendar/ics");
    return new Response(await res.text(), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="asoul_schedule.ics"',
      },
    });
  }
  return context.next();
}