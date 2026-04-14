module.exports = {
  apps: [
    {
      name: 'blade-web',
      cwd: './apps/web',
      script: 'npm',
      args: 'run start -- -p 3000',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'blade-telegram',
      cwd: '.',
      script: './apps/telegram/dist/index.js',
      node_args: '--experimental-specifier-resolution=node',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
}
