import type { Actions } from './$types';
import { env } from '$env/dynamic/private';

export const actions: Actions = {
	signIn: async ({ locals }) => {
		const redirect = env.SECRET_REDIRECT_URI;
		if (!redirect) throw new Error('Missing SECRET_REDIRECT_URI environment variable');
		await locals.logtoClient.signIn(redirect);
	},
	signOut: async ({ locals }) => {
		const postLogout = env.SECRET_POST_LOGOUT_URI;
		if (!postLogout) throw new Error('Missing SECRET_POST_LOGOUT_URI environment variable');
		await locals.logtoClient.signOut(postLogout);
	}
};
