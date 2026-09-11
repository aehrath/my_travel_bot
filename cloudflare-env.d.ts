declare namespace Cloudflare {
  interface Env {
    AVIATIONSTACK_API_KEY?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
