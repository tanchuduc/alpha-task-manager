const isSslEnabled =
  process.env.DB_SSL === "true" ||
  Boolean(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost"));

const sslConfig = isSslEnabled
  ? {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true",
    }
  : undefined;

const baseConfig: any = {
  max: +(process.env.DB_MAX_CLIENTS as string) || 20,
  connectionTimeoutMillis: +(process.env.DB_CONNECTION_TIMEOUT_MS || "10000"),
  idleTimeoutMillis: 30000,
};

if (sslConfig) {
  baseConfig.ssl = sslConfig;
}

if (process.env.DATABASE_URL || process.env.DB_URL) {
  baseConfig.connectionString = process.env.DATABASE_URL || process.env.DB_URL;
} else {
  baseConfig.user = process.env.DB_USER;
  baseConfig.password = process.env.DB_PASSWORD;
  baseConfig.database = process.env.DB_NAME;
  baseConfig.host = process.env.DB_HOST;
  baseConfig.port = +(process.env.DB_PORT as string) || 5432;
}

export default baseConfig;

