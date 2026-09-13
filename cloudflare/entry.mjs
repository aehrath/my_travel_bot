// Copy alongside the built index.js and the existing Access guard when deploying.
import app from './index.js';
import { authorizeCloudflareRequest } from './access-guard.js';
import { createWorkerHandler } from './asset-handler.js';
export default createWorkerHandler(app, authorizeCloudflareRequest);
