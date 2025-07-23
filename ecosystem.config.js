module.exports = {
  apps : [{
    name: 'telegram-cf-bot',
    script: 'index.js',
    watch: false,
    env: {
      "NODE_ENV": "production",
    }
  }]
};
