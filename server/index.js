// Entry point: `npm start`.
import { ConfigError, effectiveQlooMode, loadConfig } from './config.js';
import { buildApp } from './app.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const app = await buildApp(config, { logger: { level: config.nodeEnv === 'test' ? 'warn' : 'info' } });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    app.close().then(() => process.exit(0), () => process.exit(1));
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`Qloo: ${effectiveQlooMode(config)} | venues: ${config.venuesDir}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
