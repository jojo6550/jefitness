// Frontend Structured Logger - outputs JSON to console for structured devtools filtering
class FElogger {
  constructor(service = 'frontend') {
    this.service = service;
  }

  _log(level, msg, meta = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message: msg,
      ...meta
    };
    console[level](JSON.stringify(logEntry, null, 2));
  }

  info(msg, meta) { this._log('info', msg, meta); }
  warn(msg, meta) { this._log('warn', msg, meta); }
  error(msg, meta) { this._log('error', msg, meta); }
  debug(msg, meta) { this._log('debug', msg, meta); }
  http(msg, meta) { this._log('info', msg, { http: true, ...meta }); }
}

// Export for MPA - attach to window for easy use
window.FElogger = FElogger;

// Default logger for app.js
