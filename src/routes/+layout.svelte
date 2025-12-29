<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import AuthButton from '$lib/components/AuthButton.svelte';
	import { isAuthenticated } from '$lib/auth';
	import { page } from '$app/stores';
	import { Toaster } from 'svelte-sonner';
	import { Menu, X } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import type { UserInfoResponse } from '@logto/node';

	interface PageData {
		user?: UserInfoResponse | null;
	}

	export let data: PageData;
	$: user = data.user;
	let loaded = false;
	let mobileMenuOpen = false;

	onMount(() => {
		document.body.classList.add('js-enabled');
		loaded = true;
	});

	// Navigation items avec types stricts pour resolve
	const navItems: Array<{
		href: '/' | '/importV2' | '/export' | '/wordpress' | '/database-explorer';
		label: string;
	}> = [
		{ href: '/', label: 'Accueil' },
		{ href: '/importV2', label: 'Import CSV' },
		{ href: '/export', label: 'Export' },
		{ href: '/wordpress', label: 'WordPress' },
		{ href: '/database-explorer', label: 'BDD Explorer' }
	];
</script>

<svelte:head>
	<title>CenovDistribution - Système de gestion des kits et composants</title>
	<meta
		name="description"
		content="Plateforme de gestion hiérarchique des kits, pièces et attributs. Importez et exportez vos données techniques, gérez les catégories et les relations entre composants."
	/>
</svelte:head>

<div class="page-transition-container min-h-screen bg-gray-50 {loaded ? 'loaded' : ''}">
	<header class="sticky top-0 z-50 bg-white shadow">
		<div class="container mx-auto px-4">
			<!-- Mobile: Wrapper pour layout vertical -->
			<div class="md:hidden">
				<!-- Ligne 1: Titre + Menu burger -->
				<div class="flex items-center justify-between py-4">
					<a href={resolve('/')} class="text-xl font-bold text-[#e31206]">CenovDistribution</a>
					<button
						class="rounded-md p-2 hover:bg-gray-200"
						on:click={() => (mobileMenuOpen = !mobileMenuOpen)}
						aria-label="Menu principal"
					>
						{#if mobileMenuOpen}
							<X class="h-6 w-6 text-gray-700" />
						{:else}
							<Menu class="h-6 w-6 text-gray-700" />
						{/if}
					</button>
				</div>
			</div>

			<!-- Desktop Top bar -->
			<div class="hidden items-center justify-between py-4 md:flex">
				<a href={resolve('/')} class="text-xl font-bold text-[#e31206]">CenovDistribution</a>

				<!-- Desktop user info & auth -->
				<div class="flex items-center space-x-4">
					{#if isAuthenticated(user)}
						<span class="text-sm text-gray-700">Bonjour, {user?.name || 'Client'}</span>
					{/if}
					<AuthButton {user} />
				</div>
			</div>

			<!-- Desktop Navigation - Toujours visible -->
			<nav class="hidden border-t border-gray-200 md:block">
				<div class="flex space-x-8 py-3">
					{#each navItems as item (item.href)}
						<a
							href={resolve(item.href)}
							class="text-sm font-medium transition-colors hover:text-[#e31206] {$page.url
								.pathname === item.href
								? 'border-b-2 border-[#e31206] pb-3 text-[#e31206]'
								: 'text-gray-600'}"
						>
							{item.label}
						</a>
					{/each}
				</div>
			</nav>

			<!-- Mobile Navigation - Toujours visible si menu ouvert -->
			{#if mobileMenuOpen}
				<nav class="border-t border-gray-200 bg-gray-50 md:hidden">
					<!-- User info in mobile (seulement si connecté) -->
					{#if isAuthenticated(user)}
						<div class="border-b border-gray-200 px-4 py-3">
							<p class="text-sm font-medium text-gray-900">Bonjour,</p>
							<p class="truncate text-sm text-gray-600">{user?.name || 'Client'}</p>
						</div>
					{/if}

					<!-- Navigation links -->
					<div class="py-2">
						{#each navItems as item (item.href)}
							<a
								href={resolve(item.href)}
								class="block px-4 py-3 text-sm font-medium transition-colors hover:bg-blue-200 {$page
									.url.pathname === item.href
									? 'border-r-4 border-[#e31206] bg-red-50 text-[#e31206]'
									: 'text-gray-700'}"
								on:click={() => (mobileMenuOpen = false)}
							>
								{item.label}
							</a>
						{/each}
					</div>

					<!-- Auth button in mobile -->
					<div class="border-t border-gray-200 p-4">
						<AuthButton {user} />
					</div>
				</nav>
			{/if}
		</div>
	</header>

	<main class="container mx-auto">
		<slot />
	</main>

	<Toaster position="top-center" richColors={true} closeButton={true} duration={5000} />
</div>
