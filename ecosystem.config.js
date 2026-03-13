module.exports = {
  apps: [
    {
      name: 'gepetto-shield-api',
      script: 'apps/api/dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 4025,
      },
      kill_timeout: 5000,
      listen_timeout: 10000,
      max_restarts: 10,
      restart_delay: 1000,
    },
    {
      name: 'gepetto-shield-web',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: 'apps/web',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3025,
      },
    },
  ],
};
