import { log as baseLog } from '../../../src/logger.js';

// The landing site's logger: the React app's browser logger (src/logger.js,
// which redacts secrets and profile data), scoped. Nothing under landing/
// calls console.* itself (CLAUDE.md, rule 11).
export var log = baseLog.child('landing');
