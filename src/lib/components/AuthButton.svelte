<script lang="ts">
	import { LogOut, LogIn } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	export let user: unknown;
</script>

<form method="POST" action="/auth?/{user ? 'signOut' : 'signIn'}">
	<Button type="submit" variant="bleu" class="mb-2 me-2 font-bold">
		{#if user}
			<LogOut size={16} />
			Se déconnecter
		{:else}
			<LogIn size={16} />
			Se connecter
		{/if}
	</Button>
</form>
