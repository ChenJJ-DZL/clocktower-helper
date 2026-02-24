const fs = require('fs');

const LOG_FILE = 'custom_simulation_log.txt';

function initializeLog() {
  // This will clear the file at the beginning of the run.
  fs.writeFileSync(LOG_FILE, '--- New Game Log ---\n\n', 'utf-8');
}

function log(message) {
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} - ${message}\n`, 'utf-8');
}

function getLog() {
    return fs.readFileSync(LOG_FILE, 'utf-8');
}

function appendRuleViolations(violations) {
    if (violations.length > 0) {
        fs.appendFileSync(LOG_FILE, '\n--- Rule Violations Detected ---\n', 'utf-8');
        violations.forEach(v => {
            fs.appendFileSync(LOG_FILE, `- ${v}\n`, 'utf-8');
        });
    } else {
        fs.appendFileSync(LOG_FILE, '\n--- No Rule Violations Detected ---\n', 'utf-8');
    }
}

module.exports = {
  initializeLog,
  log,
  getLog,
  appendRuleViolations,
};

