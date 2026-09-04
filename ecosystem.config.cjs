module.exports = {
  apps: [
    {
      name: 'apiCamionex',
      script: 'dist/main.js',
      cwd: '/home/ec2-user/camionex-back',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        PORT: 5006,
        NODE_ENV: 'production',
      },
    },
  ],
};
