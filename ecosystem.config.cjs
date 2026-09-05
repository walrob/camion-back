module.exports = {
  apps: [
    {
      name: 'camionex-back',
      script: 'dist/main.js',

      // __dirname = el directorio donde vive este archivo en el servidor, no
      // aquél desde donde se ejecutó `pm2`. Con una ruta absoluta escrita a
      // mano, el archivo sólo funciona en una máquina y en una carpeta; peor
      // todavía, si se copia de otro proyecto y no se corrige, PM2 arranca
      // apuntando al código equivocado.
      cwd: __dirname,

      // fork: un solo proceso. Cluster no aporta con 1 CPU y duplica la RAM.
      //
      // Además hay una razón que no es de rendimiento: al arrancar, la app
      // corre las migraciones pendientes (`migrationsRun`) y dos seeders. Con
      // varias instancias levantando a la vez, eso son varios procesos
      // haciendo DDL sobre las mismas tablas al mismo tiempo.
      exec_mode: 'fork',
      instances: 1,

      autorestart: true,

      // Nunca `watch` en producción.
      watch: false,

      // Más holgado que el front: acá conviven sharp, pdfkit y xlsx, que
      // reservan bastante memoria al generar reportes.
      max_memory_restart: '400M',

      kill_timeout: 5000,

      // Reintentos ante crash, con backoff. `min_uptime` evita que un fallo de
      // arranque —una migración rota, por ejemplo— entre en un bucle rápido.
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '20s',

      env: {
        NODE_ENV: 'production',
        PORT: 5006,
      },
    },
  ],
};
