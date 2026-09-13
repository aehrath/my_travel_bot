// Keep authorization ahead of asset delivery when run_worker_first is enabled.
export function createWorkerHandler(app, authorizeCloudflareRequest) {
  return {
    async fetch(request, env, ctx) {
      const authorized = await authorizeCloudflareRequest(request, env);
      if (authorized instanceof Response) return authorized;
      const pathname = new URL(request.url).pathname;
      if ((request.method === "GET" || request.method === "HEAD") && env.ASSETS) {
        const asset = await env.ASSETS.fetch(authorized);
        if (asset.status !== 404 || pathname.startsWith("/_next/static/")) return asset;
      }
      const response = await app.fetch(authorized, env, ctx);
      if (pathname === "/" && response.ok) {
        const headers = new Headers(response.headers);
        headers.set("X-Travel-App-Shell", "1");
        return new Response(response.body, { status: response.status, headers });
      }
      return response;
    },
  };
}
