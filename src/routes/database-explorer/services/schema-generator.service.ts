import { z } from 'zod/v4';
import type { FieldInfo } from '$lib/prisma-meta';
import type { TableMetadata } from '../repositories/explorer.repository';

/**
 * Générer un schéma Zod depuis les métadonnées DMMF d'une table
 */
export function generateZodSchema(metadata: TableMetadata): z.ZodObject<z.ZodRawShape> {
	const shape: Record<string, z.ZodTypeAny> = {};

	for (const field of metadata.fields) {
		// Ignorer la clé primaire (auto-générée)
		if (field.isPrimaryKey) continue;

		let zodType = getZodTypeForField(field);

		// Rendre optionnel et nullable si le champ n'est pas requis
		if (!field.isRequired) {
			zodType = zodType.optional().nullable();
		}

		shape[field.name] = zodType;
	}

	return z.object(shape);
}

/**
 * Obtenir le type Zod correspondant à un champ Prisma
 */
function getZodTypeForField(field: FieldInfo): z.ZodTypeAny {
	switch (field.type) {
		case 'String':
			return z.string({ error: `${field.name} doit être une chaîne` }).min(1, {
				message: `${field.name} ne peut pas être vide`
			});

		case 'Int':
		case 'BigInt':
			return z.string().refine((val) => !Number.isNaN(Number.parseInt(val, 10)), {
				message: `${field.name} doit être un nombre entier`
			});

		case 'Float':
		case 'Decimal':
			return z.string().refine((val) => !Number.isNaN(Number.parseFloat(val)), {
				message: `${field.name} doit être un nombre`
			});

		case 'Boolean':
			return z.string().refine((val) => ['true', 'false', '1', '0'].includes(val.toLowerCase()), {
				message: `${field.name} doit être vrai ou faux`
			});

		case 'DateTime':
			return z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
				message: `${field.name} doit être une date valide`
			});

		default:
			return z.string();
	}
}

/**
 * Générer un schéma Zod pour la modification (tous les champs optionnels)
 */
export function generateUpdateSchema(metadata: TableMetadata): z.ZodObject<z.ZodRawShape> {
	const shape: Record<string, z.ZodTypeAny> = {};

	for (const field of metadata.fields) {
		// Ignorer la clé primaire
		if (field.isPrimaryKey) continue;

		const zodType = getZodTypeForField(field);
		// Tous les champs optionnels pour un update partiel
		shape[field.name] = zodType.optional().nullable();
	}

	return z.object(shape);
}