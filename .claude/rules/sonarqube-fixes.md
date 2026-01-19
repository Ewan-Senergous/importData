# Corrections SonarLint Récurrentes

Guide rapide des 5 erreurs SonarLint les plus fréquentes.

## Top 5 Corrections

### 1. S7773 - Fonctions Globales

```typescript
// ❌ Fonctions globales
isNaN(value);
parseInt(value, 10);
parseFloat(value);

// ✅ Méthodes Number
Number.isNaN(value);
Number.parseInt(value, 10);
Number.parseFloat(value);
```

### 2. S7728 - forEach avec return

```typescript
// ❌ forEach avec return (ne sort pas de la fonction !)
items.forEach((item) => {
	if (condition) return; // Sort seulement du callback
	process(item);
});

// ✅ for...of avec continue
for (const item of items) {
	if (condition) continue;
	process(item);
}
```

### 3. S6551 - Stringification Implicite

```typescript
// ❌ Stringification implicite
return String(value); // Type unknown

// ✅ Type narrowing explicite
if (typeof value === 'string') return value;
if (typeof value === 'number') return String(value);
if (typeof value === 'boolean') return String(value);
return JSON.stringify(value);
```

### 4. S2871 - Sort sans Comparateur

```typescript
// ❌ Sort sans comparateur (tri alphabétique par défaut)
array.sort();
[10, 2, 1].sort(); // [1, 10, 2] ❌

// ✅ Sort avec comparateur
// Strings
array.sort((a, b) => a.localeCompare(b));

// Nombres
array.sort((a, b) => a - b); // Croissant
array.sort((a, b) => b - a); // Décroissant

// Objets
users.sort((a, b) => a.name.localeCompare(b.name));
```

### 5. S7741/S6606 - typeof undefined

```typescript
// ❌ typeof undefined (verbeux)
if (typeof globalThis.foo === 'undefined') {
	globalThis.foo = defaultValue;
}

// ✅ Nullish coalescing
globalThis.foo ??= defaultValue;
value ??= 'default';
config.timeout ??= 5000;
```

**Note :** `??` vs `||`

```typescript
const count = 0;
count || 10; // 10 (0 est falsy)
count ?? 10; // 0 (0 n'est pas nullish)
```

## Autres Corrections Rapides

```typescript
// S1854 - Variable non utilisée
// ❌ const result = calculate(); return otherValue;
// ✅ return calculate();

// S3776 - Complexité cognitive
// ❌ if (a) { if (b) { if (c) { ... } } }
// ✅ if (!a) return; if (!b) return; if (!c) return;

// S1481 - Paramètre non utilisé
// ❌ function process(data, index, array) { return data.value; }
// ✅ function process(data) { return data.value; }
```

## Checklist Avant Commit

- [ ] `isNaN/parseInt/parseFloat` → `Number.*`
- [ ] `.forEach()` avec `return` → `for...of` avec `continue`
- [ ] Type narrowing explicite pour `unknown`
- [ ] Comparateur à `.sort()`
- [ ] `??=` au lieu de `typeof === 'undefined'`
- [ ] Supprimer variables/paramètres non utilisés
- [ ] Early returns pour réduire complexité

**Vérifier :**

```bash
pnpm lint  # Vérifie ESLint + SonarLint
```
