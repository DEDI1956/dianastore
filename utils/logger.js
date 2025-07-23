const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '..', 'error.log');

const log = (level, message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}\n`;

    // Tulis ke console
    if (level === 'error') {
        console.error(logMessage);
    } else {
        console.log(logMessage);
    }

    // Tulis ke file jika error
    if (level === 'error') {
        fs.appendFile(logFilePath, logMessage, (err) => {
            if (err) {
                console.error('Failed to write to log file:', err);
            }
        });
    }
};

const logger = {
    info: (message) => log('info', message),
    warn: (message) => log('warn', message),
    error: (message) => log('error', message),
};

module.exports = logger;
