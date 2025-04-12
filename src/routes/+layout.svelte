<script>
  import { theme } from '$lib/stores';
  import { onMount } from 'svelte';
  import '../app.css';

  // Initialize theme on mount
  onMount(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme') || 'light';
      theme.set(savedTheme);
    }
  });
</script>

<slot />
