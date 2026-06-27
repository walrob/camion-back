module.exports = {
  apps: [
    {
      name: 'apiNatu',
      script: 'dist/main.js',
      cwd: '/home/ec2-user/ecommerce-back',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        PORT: 5002,
        NODE_ENV: 'production',
      },
    },
  ],
};
