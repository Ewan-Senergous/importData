import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
	datasource: {
		url: env('CENOV_PREPROD_DATABASE_URL')
	},
	schema: './schema.prisma'
});
