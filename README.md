# Coachella 2025 Schedule Viewer

A modern, responsive web application for browsing the Coachella 2025 lineup by day, time, and stage. Features timezone support and livestream links.

![Coachella Schedule Viewer](https://via.placeholder.com/800x400?text=Coachella+Schedule+Viewer)

## Features

- **Schedule View**: Browse performances by day and time
- **List View**: See all performances in chronological order
- **Search**: Find specific artists quickly
- **Timezone Support**: View times in your local timezone or festival time
- **Livestream Links**: Direct links to YouTube livestreams for each stage
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Dark Mode**: Toggle between light and dark themes
- **Collapsible Filters**: Save screen space by hiding filters when not needed

## Technology Stack

- [SvelteKit](https://kit.svelte.dev/) - Frontend framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [date-fns-tz](https://github.com/marnusw/date-fns-tz) - Timezone handling
- [Cloudflare Pages](https://pages.cloudflare.com/) - Hosting and deployment

## Development

### Prerequisites

- Node.js (v18 or later)
- npm or yarn

### Setup

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/coachella-schedule.git
   cd coachella-schedule
   ```

2. Install dependencies
   ```bash
   npm install
   # or
   yarn
   ```

3. Start the development server
   ```bash
   npm run dev
   # or
   yarn dev
   ```

4. Open your browser and navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
# or
yarn build
```

## Deployment

This project is configured to deploy to Cloudflare Pages. Connect your repository to Cloudflare Pages and set the build command to `npm run build` and the build directory to `build`.

## License

MIT

## Acknowledgements

- Schedule data is for demonstration purposes only
- Icons from [Feather Icons](https://feathericons.com/)
