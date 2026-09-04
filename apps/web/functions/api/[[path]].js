// Pages Function: proxy /api/* to Workers API
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const target = `https://asoul-timeline-api.caiguu.workers.dev${url.pathname}${url.search}`;
  return fetch(target, {
    method: context.request.method,
    headers: context.request.headers,
  });
}