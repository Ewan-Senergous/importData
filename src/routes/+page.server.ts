import type { Actions } from './$types';
import { env } from '$env/dynamic/private';

export const actions: Actions = {
	signIn: async ({ locals }) => {
		await locals.logtoClient.signIn(env.SECRET_REDIRECT_URI!);
	},
	signOut: async ({ locals }) => {
		await locals.logtoClient.signOut(env.SECRET_POST_LOGOUT_URI);
	}
};
