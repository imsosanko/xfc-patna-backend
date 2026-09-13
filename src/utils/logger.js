const log = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '✅',
    error: '❌',
    warn: '⚠️',
    debug: '🔍',
  }[type] || 'ℹ️';
  
  console.log(`[${timestamp}] ${prefix} ${message}`);
};

module.exports = { log };