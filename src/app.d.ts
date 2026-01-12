import type { LogtoClient, UserInfoResponse } from '@logto/sveltekit';

declare global {
	namespace App {
		interface Locals {
			logtoClient: LogtoClient;
			user?: UserInfoResponse;
			requestId: string; // Request ID pour traçabilité logs
		}
	}
}

export {};
