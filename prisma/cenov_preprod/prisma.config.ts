import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Charger .env depuis la racine du projet
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
	datasource: {
		url: env('CENOV_PREPROD_DATABASE_URL')
	},
	schema: './schema.prisma'
});
