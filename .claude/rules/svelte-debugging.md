# Debugging Réactivité Svelte 5

Guide rapide pour diagnostiquer et résoudre les problèmes de réactivité Svelte 5.

## Problème : Console.log Accidentellement Réactifs

### ⚠️ Symptôme

Fonctionnalité casse après suppression de `console.log` "innocents".

### 🔍 Cause

```typescript
// ❌ PROBLÉMATIQUE - console.log maintient la réactivité
$: if (condition) {
	someVariable = newValue;
	console.log('Debug:', someVariable); // Force l'observation !
}

// ❌ Sans le log, la réactivité se casse
$: if (condition) {
	someVariable = newValue; // Plus observée par Svelte
}
```

**Pourquoi ?** Le `console.log` force Svelte à observer la variable.

## Solution : Migration Svelte 5

```typescript
// ❌ ANCIEN - Hack avec console.log
$: if (step === 3 && data.length > 0 && !config) {
	config = { ...formData };
	console.log('Config sauvée:', config);
}

// ✅ NOUVEAU - Svelte 5 propre
let config = $state(null);
let shouldSaveConfig = $derived(step === 3 && data.length > 0 && !config);

$effect(() => {
	if (shouldSaveConfig) {
		config = { ...formData };
		console.log('Config sauvée:', config); // Informatif seulement
	}
});
```

## Patterns de Migration

### 1. Variables d'État

```typescript
// ❌ Ancien
let state = initialValue;

// ✅ Nouveau
let state = $state(initialValue);
```

### 2. Props

```typescript
// ❌ Ancien
export let data;

// ✅ Nouveau
let { data } = $props();
```

### 3. Déclarations Réactives

```typescript
// ❌ Ancien
$: filteredData = data.filter((item) => item.active);

// ✅ Nouveau
let filteredData = $derived(data.filter((item) => item.active));
```

### 4. Effets de Bord

```typescript
// ❌ Ancien
$: {
	if (condition) performSideEffect();
}

// ✅ Nouveau
$effect(() => {
	if (condition) performSideEffect();
});
```

### 5. Composants Dynamiques

```svelte
<!-- ❌ Ancien -->
<svelte:component this={getComponent(type)} />

<!-- ✅ Nouveau -->
{@const Component = getComponent(type)}
<Component />
```

## Diagnostic Rapide

**Si problème de réactivité :**

1. Chercher `console.log` dans déclarations réactives `$:`
2. Migrer vers `$state` + `$derived` + `$effect`
3. Séparer logique et debug

```typescript
// ❌ Mélanger logique et debug
$: {
	processData();
	console.log('Processing...');
	updateUI();
}

// ✅ Séparer
$effect(() => {
	processData();
	updateUI();
});

$effect(() => {
	console.log('Processing...');
});
```

## Clés dans Boucles {#each}

**Erreur commune :** Oublier les clés dans `{#each}`.

```svelte
<!-- ❌ MAUVAIS -->
{#each items as item}

<!-- ✅ CORRECT -->
{#each items as item (item.id)}           <!-- ID unique (meilleur) -->
{#each columns as column (column.key)}    <!-- Propriété unique -->
{#each rows as row, i (i)}                <!-- Index (dernier recours) -->
```

**Priorité :** ID unique > Propriété unique > Valeur primitive > Index

## Checklist

- [ ] Pas de `console.log` dans `$:` déclarations
- [ ] Variables modifiables → `$state()`
- [ ] Props → `$props()`
- [ ] Valeurs calculées → `$derived()`
- [ ] Effets de bord → `$effect()`
- [ ] Clés dans toutes les boucles `{#each}`
- [ ] Pas de `<svelte:component>` (utiliser `{@const}`)
