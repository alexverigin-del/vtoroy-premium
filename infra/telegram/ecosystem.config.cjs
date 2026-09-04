module.exports = {
  apps: [{
    name: 'isvoi-telegram',
    cwd: '/opt/isvoi',
    script: 'scripts/run_telegram_worker.mjs',
    args: '--env /opt/isvoi/infra/telegram/.env',
    instances: 1,
    exec_mode: 'fork',
    node_args: '--dns-result-order=ipv4first --no-network-family-autoselection',
    autorestart: true,
    restart_delay: 10000,
    max_memory_restart: '160M',
    kill_timeout: 30000,
  }],
};
