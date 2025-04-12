import { browser } from '$app/environment';
import { writable } from 'svelte/store';

// Create a writable store with a more concise initialization
export const theme = writable(browser ? localStorage.getItem('theme') || 'light' : 'light');

// Subscribe to theme changes and update localStorage and document attributes
if (browser) {
  theme.subscribe(value => {
    localStorage.setItem('theme', value);
    document.documentElement.setAttribute('data-theme', value);
  });
}
