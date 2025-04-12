<script>
  import { theme } from '$lib/stores';
  import { onMount } from 'svelte';

  // Initialize theme on mount
  onMount(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme') || 'light';
      theme.set(savedTheme);
    }
  });
</script>

<slot />

<style>
  /* Global styles that apply to the entire app */
  :global(body) {
    margin: 0;
    padding: 0;
    background-color: var(--background-color, #f9f9f9);
    color: var(--text-color, #333);
    transition: background-color 0.3s ease, color 0.3s ease;
  }

  :global(html[data-theme="dark"] body) {
    background-color: #121212;
    color: #e0e0e0;
  }
</style>
