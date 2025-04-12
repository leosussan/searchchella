import { browser } from '$app/environment';
import { writable } from 'svelte/store';

// Initialize theme from localStorage or default to 'light'
const initialTheme = browser && localStorage.getItem('theme') || 'light';

// Create a writable store for the theme
export const theme = writable(initialTheme);

// Subscribe to theme changes and update localStorage and document attributes
if (browser) {
  theme.subscribe(value => {
    localStorage.setItem('theme', value);
    document.documentElement.setAttribute('data-theme', value);
  });
}
